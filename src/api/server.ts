import 'dotenv/config';
import express, { Router } from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { logger, LogLevel, requestLoggerMiddleware } from '../shared/lib/logger';
import { config, isCloudEnabled } from '../config/env';
import { initializeSentry, setupGlobalErrorHandlers, captureException } from '../monitoring/errorTracking';
import HealthMonitor from '../monitoring/HealthMonitor';

import { OrderServiceFactory } from './services/orders/OrderServiceFactory';
import { AccountingService } from './services/AccountingService';
import deliveryRoutes from './routes/deliveryRoutes';
import accountingRoutes from './routes/accountingRoutes';
import customerRoutes from './routes/customerRoutes';
import reportRoutes from './routes/reportRoutes';
import orderWorkflowRoutes from './routes/orderWorkflowRoutes';
import cashierRoutes from './routes/cashierRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import coaRoutes from './routes/coaRoutes';
import supplierRoutes from './routes/supplierRoutes';
import financeRoutes from './routes/financeRoutes';
import superAdminRoutes from './routes/superAdminRoutes';
import printerRoutes from './routes/printerRoutes';
import platformRoutes from './routes/platformRoutes';
import { platformAuthMiddleware, requirePlatformRole } from './middleware/platformAuthMiddleware';
import { platformAuthService } from './services/platform/PlatformAuthService';
import { platformJwtService } from './services/platform/PlatformJwtService';
import { toUTCRange } from '../shared/utils/dateUtils';
import { jwtService } from './services/auth/JwtService';
import { refreshTokenService } from './services/auth/RefreshTokenService';
import { authMiddleware, requireRole } from './middleware/authMiddleware';
import { sessionGateMiddleware } from './middleware/sessionGate';
import { sendPaymentVerified, sendPaymentRejected } from './services/notificationService.js';
import { journalEntryService } from './services/JournalEntryService';
import { LicenseService } from './services/licensing/LicenseService';
import { qrOrderBridge } from './services/qr/QROrderBridge';
import { syncMenuToCloud } from './services/qr/MenuSync';
import { EventBus, DomainEvent } from '../shared/lib/EventBus';
import { OutboxReader } from './services/OutboxReader';
import { IntegrationDispatcher } from './services/integration/IntegrationDispatcher';
import { IntegrationRegistry } from './services/integration/IntegrationRegistry';
import { MockConnector } from './services/integration/connectors/MockConnector';
import { PaymentRegistry } from './services/payment/PaymentRegistry';
import { MockPaymentProvider } from './services/payment/providers/MockPaymentProvider';
import { FiscalRegistry } from './services/fiscal/FiscalRegistry';
import { MockFiscalProvider } from './services/fiscal/providers/MockFiscalProvider';
import { FiscalHttpConnector } from './services/fiscal/connectors/FiscalHttpConnector';
import { HmacAuth } from './services/fiscal/HmacAuth';
import { FiscalDeliveryService } from './services/fiscal/FiscalDeliveryService';
import fiscalConnectorRoutes from './routes/fiscalConnectorRoutes';


const accounting = new AccountingService();
import {
    generatePairingCode,
    verifyPairingCode,
    cleanupExpiredCodes,
    listPairedDevices,
    disableDevice
} from './services/pairing/PairingService';
import {
    seatPartyWithCapacityCheck,
    updateGuestCount,
    createSection,
    updateSection,
    deleteSection,
    reorderSections,
    createTable,
    updateTable,
    deleteTable,
    getFloorLayout
} from './services/FloorManagementService';

// Initialize enterprise infrastructure
(async () => {
    // Validate environment variables (exits if invalid)
    try {
        logger.log({
            level: LogLevel.INFO,
            service: 'startup',
            action: 'environment_validation',
            metadata: {
                node_env: config.NODE_ENV,
                cloud_enabled: !!config.VITE_SUPABASE_URL
            }
        }, true);
    } catch (err) {
        logger.log({
            level: LogLevel.CRITICAL,
            service: 'startup',
            action: 'environment_validation_failed',
            error: { message: (err as Error).message }
        }, true);
        process.exit(1);
    }

    // Initialize error tracking (Sentry)
    await initializeSentry();
    setupGlobalErrorHandlers();
})();

const prisma = new PrismaClient();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.set('io', io);

const eventBus = EventBus.getInstance();
const outboxReader = new OutboxReader(1000);
const integrationRegistry = IntegrationRegistry.getInstance();
const integrationDispatcher = new IntegrationDispatcher(1000);

eventBus.subscribe('ORDER_CREATED', (event: DomainEvent) => {
    io.to(`restaurant:${event.restaurantId}`).emit('db_change', {
        eventId: event.eventId,
        table: 'orders',
        eventType: 'INSERT',
        data: event.payload
    });
});

// Register mock connector for Mission 010
const mockConnector = new MockConnector();
integrationRegistry.register(mockConnector);

// Register mock payment provider for Mission 011
const paymentRegistry = PaymentRegistry.getInstance();
const mockPaymentProvider = new MockPaymentProvider();
paymentRegistry.register(mockPaymentProvider);

// Register mock fiscal provider for Mission 012
const fiscalRegistry = FiscalRegistry.getInstance();
const mockFiscalProvider = new MockFiscalProvider();
fiscalRegistry.register(mockFiscalProvider);

// Register fiscal HTTP connector for Mission 013
const hmacAuth = HmacAuth.getInstance();
hmacAuth.registerKey({
  keyId: 'fireflow-fiscal-pk-dev',
  secret: 'dev-secret-change-in-production',
  audience: 'fireflow-fiscal-pk',
  createdAt: new Date(),
});

const fiscalConnectorUrl = process.env.FISCAL_CONNECTOR_URL || 'http://localhost:3001';
const fiscalHttpConnector = new FiscalHttpConnector(fiscalConnectorUrl, hmacAuth, 'fireflow-fiscal-pk-dev');
integrationRegistry.register(fiscalHttpConnector);

// Start fiscal delivery service
const fiscalDeliveryService = FiscalDeliveryService.getInstance();
fiscalDeliveryService.start();

// Phase 1 slice B: owner-invite + cloud-mirror dispatcher.
// Idle unless Supabase credentials exist; disabled in test mode so the
// release gate never issues real provider calls (tests drive it directly).
if (config.NODE_ENV !== 'test') {
    const { ownerInviteDispatcher } = await import('./services/onboarding/OwnerInviteDispatcher');
    ownerInviteDispatcher.start();
}

// Initialize health monitor
const healthMonitor = HealthMonitor.initialize(prisma);

// Periodic health checks (every 30 seconds in production)
if (config.NODE_ENV === 'production') {
    setInterval(async () => {
        const health = await healthMonitor.checkHealth();
        if (health.status !== 'healthy') {
            logger.log({
                level: health.status === 'unhealthy' ? LogLevel.CRITICAL : LogLevel.WARN,
                service: 'health_check',
                action: 'health_status_check',
                metadata: { status: health.status, checks: health.checks }
            });
        }
    }, 30000);
}

// --- Socket.IO Connection Handler ---
io.on('connection', async (socket) => {
    // Mission 016B (F-SEC-3): identify sockets from BOTH transport forms �
    // an `Authorization: Bearer <jwt>` header or a bare JWT in the handshake
    // auth payload. Previously the bare-handshake form failed the Bearer
    // prefix check and EVERY socket was silently treated as 'none'.
    const rawAuthHeader = socket.handshake.headers?.authorization;
    const handshakeToken = socket.handshake.auth?.token;
    const bearerFromHeader = typeof rawAuthHeader === 'string' && rawAuthHeader.startsWith('Bearer ')
        ? rawAuthHeader.slice('Bearer '.length)
        : undefined;
    const normalizedHandshake = typeof handshakeToken === 'string' && handshakeToken.startsWith('Bearer ')
        ? handshakeToken.slice('Bearer '.length)
        : handshakeToken;
    const token = bearerFromHeader || (typeof normalizedHandshake === 'string' ? normalizedHandshake : undefined);
    let socketUser: { staffId?: string; restaurantId?: string; platformUser?: any; supportSession?: any } = {};
    let socketAuthType: 'tenant' | 'platform' | 'support' | 'none' = 'none';

    if (token && typeof token === 'string') {
            try {
                const decoded = jwtService.verifyToken(token);
                if (decoded.valid && decoded.payload) {
                    socketUser = {
                        staffId: decoded.payload.staffId,
                        restaurantId: decoded.payload.restaurantId
                    };
                    socketAuthType = 'tenant';
                }
            } catch (e) {
                // Token verification failed; try platform auth
                const platformResult = await platformAuthService.verifyAccessToken(token);
                if (platformResult.valid && platformResult.user) {
                    socketUser = { platformUser: platformResult.user };
                    socketAuthType = 'platform';
                }
            }
    }

    socket.data.user = socketUser;
    socket.data.authType = socketAuthType;

    console.log(`[SOCKET] User connected: ${socket.id} (${socketAuthType})`);

    socket.on('join', async (data: { room: string }) => {
        const room = data.room;
        if (!room) return;

        let authorized = false;

        if (socketAuthType === 'tenant' && socketUser.restaurantId) {
            authorized = room === `restaurant:${socketUser.restaurantId}`;
        } else if (socketAuthType === 'platform') {
            authorized = room.startsWith('platform:') || room.startsWith('support:');
        } else if (socketAuthType === 'none') {
            authorized = room === 'public';
        }

        if (!authorized) {
            console.warn(`[SOCKET] Socket ${socket.id} unauthorized for room: ${room} (${socketAuthType})`);
            return;
        }

        socket.join(room);
        console.log(`[SOCKET] Socket ${socket.id} joined room: ${room}`);
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] User disconnected: ${socket.id}`);
    });
});

// ==========================================
// 🚨 CRITICAL MIDDLEWARE (MUST BE AT TOP) 🚨
// ==========================================
app.use(cors());
app.use(express.json());

// Enterprise logging middleware
app.use(requestLoggerMiddleware);

// Serve the Local PWA Customer Menu
app.use('/pwa', express.static(path.join(process.cwd(), 'public/pwa')));

// Health check for Electron startup with monitoring
app.get('/api/health', async (_req, res) => {
    try {
        const health = await healthMonitor.checkHealth();
        
        // For startup, consider degraded as ok (but log it)
        const statusCode = health.status === 'unhealthy' ? 503 : 200;
        
        res.status(statusCode).json({
            status: health.status,
            timestamp: health.timestamp,
            uptime: health.uptime,
            checks: health.checks
        });
    } catch (err) {
        logger.log({
            level: LogLevel.ERROR,
            service: 'health_check',
            action: 'health_check_error',
            error: { message: (err as Error).message }
        });
        res.status(503).json({
            status: 'unhealthy',
            error: 'Health check failed'
        });
    }
});

// ==========================================
// 🔑 LICENSING & SUBSCRIPTION (PUBLIC)
// ==========================================

/**
 * GET /api/licensing/fingerprint
 * Returns the unique hardware fingerprint of this machine.
 */
app.get('/api/licensing/fingerprint', (_req, res) => {
    try {
        const fingerprint = LicenseService.getHardwareFingerprint();
        res.json({ fingerprint });
    } catch (e: any) {
        console.error('[ERROR] GET /api/licensing/fingerprint:', e.message);
        res.status(500).json({ error: 'Failed to retrieve hardware fingerprint' });
    }
});

/**
 * POST /api/licensing/activate
 * Accepts a signed cryptographic license token, validates it, and writes it to disk.
 * Body: { licenseToken: "eyJhb..." }
 */
app.post('/api/licensing/activate', async (req, res) => {
    try {
        const { licenseToken } = req.body;
        if (!licenseToken) {
            return res.status(400).json({ error: 'licenseToken is required in request body' });
        }

        // 1. Fetch restaurant ID from active restaurants
        const activeRestaurant = await prisma.restaurants.findFirst({
            select: { id: true }
        });

        if (!activeRestaurant) {
            return res.status(404).json({ error: 'No local restaurant database initialized. Seed the DB first.' });
        }

        // 2. Perform test validation before saving
        const payload = LicenseService.verifyLicenseToken(licenseToken);
        if (!payload) {
            return res.status(422).json({ error: 'Invalid license signature or corrupt license token format' });
        }

        if (payload.restaurant_id !== activeRestaurant.id) {
            return res.status(422).json({ error: `This license belongs to a different restaurant (ID: ${payload.restaurant_id}) and cannot activate this terminal.` });
        }

        const systemFingerprint = LicenseService.getHardwareFingerprint();
        if (payload.hardware_fingerprint && payload.hardware_fingerprint !== systemFingerprint) {
            return res.status(422).json({ error: 'Hardware fingerprint in license does not match this server terminal.' });
        }

        // 3. Write license to disk
        const saved = LicenseService.saveLicense(licenseToken);
        if (!saved) {
            return res.status(500).json({ error: 'Failed to write license file to system disk' });
        }

        res.json({ 
            success: true, 
            message: 'License activated successfully!',
            plan: payload.plan,
            expiresAt: payload.subscription_expires_at
        });
    } catch (e: any) {
        console.error('[ERROR] POST /api/licensing/activate:', e.message);
        res.status(500).json({ error: e.message || 'Activation failed' });
    }
});

/**
 * GET /api/licensing/status
 * Returns full status of local cryptographic license.
 * Phase 1 (condition 4): tenant-scoped evaluation. Authenticated requests bind
 * strictly to req.restaurantId; unauthenticated requests fall back to a
 * single-restaurant node only. On zero/ambiguous rows NO unordered findFirst
 * binding happens � payload-only evaluation instead.
 */
app.get('/api/licensing/status', async (req, res) => {
    try {
        // Mission 016B release controls: mirror verifyLicensingMiddleware's test
        // exemption � this endpoint cannot bind tenants in multi-tenant dev DBs.
        if (process.env.NODE_ENV === 'test') {
            return res.json({ status: 'active', testModeSkip: true });
        }

        let activeRestaurant: { id: string; name: string; subscription_plan: string; subscription_status: string } | null = null;

        if ((req as any).restaurantId) {
            const scoped = await prisma.restaurants.findUnique({
                where: { id: (req as any).restaurantId },
                select: { id: true, name: true, subscription_plan: true, subscription_status: true }
            });
            if (!scoped) return res.status(404).json({ error: 'Authenticated restaurant not found' });
            activeRestaurant = scoped;
        } else {
            const rowCount = await prisma.restaurants.count();
            if (rowCount === 1) {
                activeRestaurant = await prisma.restaurants.findFirst({
                    select: { id: true, name: true, subscription_plan: true, subscription_status: true }
                });
            }
        }

        let verification;
        if (activeRestaurant) {
            verification = await LicenseService.evaluateLocalLicenseStatus(activeRestaurant.id);
        } else {
            verification = await LicenseService.evaluateUnboundLicenseStatus();
        }

        // Synchronize local database meta strings on check (only when bound)
        if (activeRestaurant && verification.status === 'active' && verification.payload) {
            const currentDbStatus = activeRestaurant.subscription_status;
            const currentDbPlan = activeRestaurant.subscription_plan;

            if (currentDbStatus !== 'active' || currentDbPlan !== verification.payload.plan) {
                await prisma.restaurants.update({
                    where: { id: activeRestaurant.id },
                    data: {
                        subscription_status: 'active',
                        subscription_plan: verification.payload.plan,
                        subscription_expires_at: new Date(verification.payload.subscription_expires_at)
                    }
                });
            }
        } else if (activeRestaurant && (verification.status === 'expired' || verification.status === 'tampered')) {
            if (activeRestaurant.subscription_status !== 'expired') {
                await prisma.restaurants.update({
                    where: { id: activeRestaurant.id },
                    data: { subscription_status: 'expired' }
                });
            }
        }

        res.json({
            status: verification.status,
            daysRemaining: verification.daysRemaining || 0,
            error: verification.error,
            plan: verification.payload?.plan || activeRestaurant?.subscription_plan || 'BASIC',
            restaurantName: verification.payload?.restaurant_name || activeRestaurant?.name || 'Fireflow',
            expiresAt: verification.payload?.subscription_expires_at || null
        });
    } catch (e: any) {
        console.error('[ERROR] GET /api/licensing/status:', e.message);
        res.status(500).json({ error: 'Failed to retrieve license status' });
    }
});

/**
 * POST /api/licensing/sync
 * Sync latest license from cloud Supabase
 * Phase 1 (condition 4): same tenant-scoping contract as /status � explicit
 * identity when authenticated, single-restaurant fallback only, otherwise
 * ambiguous ? 409 rather than an arbitrary first-row binding.
 */
app.post('/api/licensing/sync', async (req, res) => {
    try {
        let activeRestaurant: { id: string } | null = null;

        if ((req as any).restaurantId) {
            const scoped = await prisma.restaurants.findUnique({
                where: { id: (req as any).restaurantId },
                select: { id: true }
            });
            if (!scoped) return res.status(404).json({ error: 'Authenticated restaurant not found' });
            activeRestaurant = scoped;
        } else {
            const rowCount = await prisma.restaurants.count();
            if (rowCount === 1) {
                activeRestaurant = await prisma.restaurants.findFirst({ select: { id: true } });
            } else if (rowCount > 1) {
                return res.status(409).json({ error: 'Ambiguous tenant context for license sync; authenticate or reduce to a single restaurant' });
            }
        }

        if (!activeRestaurant) return res.status(404).json({ error: 'No local restaurant initialized' });

        const { getSupabaseClient } = await import('../shared/lib/cloudClient.js');
        const cloud = getSupabaseClient();
        
        const { data, error } = await cloud
            .from('license_keys')
            .select('key')
            .eq('restaurant_id', activeRestaurant.id)
            .neq('status', 'revoked')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'No new license key found in cloud' });
        }

        const payload = LicenseService.verifyLicenseToken(data.key);
        if (!payload) return res.status(400).json({ error: 'Cloud license signature invalid' });

        const saved = LicenseService.saveLicense(data.key);
        if (!saved) return res.status(500).json({ error: 'Failed to write license file' });

        await prisma.restaurants.update({
            where: { id: activeRestaurant.id },
            data: { 
                subscription_status: 'active',
                subscription_plan: payload.plan,
                subscription_expires_at: new Date(payload.subscription_expires_at)
            }
        });

        res.json({ success: true, message: 'License synced successfully' });
    } catch (e: any) {
        console.error('[ERROR] POST /api/licensing/sync:', e.message);
        res.status(500).json({ error: 'Sync failed' });
    }
});

// ==========================================
// 🛡︝ 1. AUTHENTICATION (SPECIFIC)
// ==========================================

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 5, // attempts per window per IP
    keyGenerator: (req) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        return `login:${ip}`;
    },
    message: 'Too many login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
});

const verifyPinLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: Number(process.env.VERIFY_PIN_RATE_LIMIT_MAX) || 5, // attempts per window per IP
    keyGenerator: (req) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        return `verify-pin:${ip}`;
    },
    message: 'Too many PIN verification attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
});

/**
 * POST /api/auth/login
 * PIN-based authentication with JWT token generation
 * 
 * Request: { pin: "123456", restaurant_id?: "uuid" }
 * Response: { 
 *   success: true, 
 *   staff: { id, name, role, ... },
 *   tokens: { 
 *     access_token: "jwt", 
 *     refresh_token: "jwt", 
 *     expires_in: 900 (seconds)
 *   }
 * }
 */
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { pin, restaurant_id, staff_name } = req.body;
    const startTime = Date.now();
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    // Mission 016B (F-SEC-1/F-SEC-2): tenant context is REQUIRED and every
    // identity lookup is scoped to it. The plaintext `pin` column is never
    // read; authentication verifies exclusively against stored bcrypt hashes.
    if (!pin || typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
        return res.status(400).json({ error: 'Invalid credentials' });
    }
    if (!restaurant_id || typeof restaurant_id !== 'string') {
        logger.log({
            level: LogLevel.WARN,
            service: 'auth',
            action: 'login_missing_tenant_context',
            metadata: { ip_address: ipAddress }
        });
        return res.status(400).json({ error: 'Invalid credentials' });
    }

    try {
        const tenantRow = await prisma.restaurants.findUnique({
            where: { id: restaurant_id },
            select: { id: true, is_active: true }
        });

        // Identical response for unknown and inactive tenants: no existence oracle.
        // Audit rows use a null tenant FK when the tenant itself is unknown.
        if (!tenantRow || !tenantRow.is_active) {
            await prisma.audit_logs.create({
                data: {
                    restaurant_id: null,
                    action_type: 'STAFF_LOGIN_FAILED',
                    entity_type: 'RESTAURANT',
                    entity_id: null,
                    details: {
                        reason: !tenantRow ? 'tenant_unknown' : 'tenant_inactive',
                        attempted_tenant_id: restaurant_id,
                        ip_address: ipAddress
                    }
                }
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const nameFilter = typeof staff_name === 'string' && staff_name.trim().length > 0 ? staff_name.trim() : undefined;

        const candidates = await prisma.staff.findMany({
            where: {
                restaurant_id: restaurant_id,
                status: 'active',
                hashed_pin: { not: null },
                ...(nameFilter ? { name: nameFilter } : {})
            },
            select: {
                id: true,
                name: true,
                role: true,
                status: true,
                restaurant_id: true,
                hashed_pin: true,
                failed_login_count: true,
                locked_until: true,
                must_change_pin: true,
                pin_expires_at: true
            }
        });

        const now = Date.now();
        const eligible = candidates.filter(c => !c.locked_until || c.locked_until.getTime() <= now);

        if (eligible.length === 0) {
            await prisma.audit_logs.create({
                data: {
                    restaurant_id: restaurant_id,
                    action_type: 'STAFF_LOGIN_FAILED',
                    entity_type: 'RESTAURANT',
                    entity_id: restaurant_id,
                    details: {
                        reason: 'no_eligible_staff',
                        ip_address: ipAddress
                    }
                }
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        let user: (typeof eligible)[number] | null = null;
        for (const candidate of eligible) {
            try {
                if (candidate.hashed_pin && await bcrypt.compare(pin, candidate.hashed_pin)) {
                    user = candidate;
                    break;
                }
            } catch (e) {
                await prisma.audit_logs.create({
                    data: {
                        restaurant_id: restaurant_id,
                        staff_id: candidate.id,
                        action_type: 'STAFF_LOGIN_FAILED',
                        entity_type: 'STAFF',
                        entity_id: candidate.id,
                        details: {
                            reason: 'bcrypt_error',
                            error: (e as Error).message,
                            ip_address: ipAddress
                        }
                    }
                });
            }
        }

        // Phase 2: expired one-time PINs authenticate NOTHING. Check runs only
        // after a successful bcrypt match, so the code leaks nothing to callers
        // who cannot already produce the PIN. No session or tokens are issued.
        if (user && user.pin_expires_at && user.pin_expires_at.getTime() <= Date.now()) {
            await prisma.audit_logs.create({
                data: {
                    restaurant_id: restaurant_id,
                    staff_id: user.id,
                    action_type: 'STAFF_LOGIN_FAILED',
                    entity_type: 'STAFF',
                    entity_id: user.id,
                    details: { reason: 'pin_expired', ip_address: ipAddress }
                }
            });
            return res.status(403).json({
                error: 'This PIN has expired and can no longer be used. Request a new PIN via FireFlow Vault support.',
                code: 'PIN_EXPIRED'
            });
        }

        if (!user) {
            // Failure accounting: per-staff lockout requires an unambiguous
            // target. With a single eligible candidate we preserve the existing
            // counter/lockout behavior; with several we record the event without
            // punishing unrelated accounts.
            if (eligible.length === 1) {                const c = eligible[0];
                const newFailedCount = (c.failed_login_count || 0) + 1;
                const updateData: any = { failed_login_count: newFailedCount };

                if (newFailedCount >= 5) {
                    updateData.locked_until = new Date(now + 30 * 60 * 1000); // 30 minutes
                    await prisma.audit_logs.create({
                        data: {
                            restaurant_id: restaurant_id,
                            staff_id: c.id,
                            action_type: 'STAFF_LOCKED',
                            entity_type: 'STAFF',
                            entity_id: c.id,
                            details: {
                                failed_count: newFailedCount,
                                locked_until: updateData.locked_until.toISOString(),
                                ip_address: ipAddress
                            }
                        }
                    });
                }

                await prisma.staff.update({ where: { id: c.id }, data: updateData });

                await prisma.audit_logs.create({
                    data: {
                        restaurant_id: restaurant_id,
                        staff_id: c.id,
                        action_type: 'STAFF_LOGIN_FAILED',
                        entity_type: 'STAFF',
                        entity_id: c.id,
                        details: {
                            reason: 'invalid_pin',
                            failed_count: newFailedCount,
                            ip_address: ipAddress
                        }
                    }
                });
            } else {
                await prisma.audit_logs.create({
                    data: {
                        restaurant_id: restaurant_id,
                        action_type: 'STAFF_LOGIN_FAILED',
                        entity_type: 'RESTAURANT',
                        entity_id: restaurant_id,
                        details: {
                            reason: 'invalid_pin_multi_candidate',
                            candidates: eligible.length,
                            ip_address: ipAddress
                        }
                    }
                });
            }

            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const lastLoginAt = new Date();
        await prisma.staff.update({
            where: { id: user.id },
            data: { last_login: lastLoginAt, failed_login_count: 0, locked_until: null }
        });

        const restaurant = await prisma.restaurants.findUnique({
            where: { id: user.restaurant_id },
            select: { id: true, name: true, slug: true, logo_url: true as any, onboarding_status: true }
        });

        const accessToken = jwtService.generateAccessToken(
            user.id,
            user.restaurant_id,
            user.role,
            user.name
        );

        const { token: refreshToken } = await refreshTokenService.createStaffRefreshToken(
            user.id,
            user.restaurant_id
        );

        await prisma.$transaction(async (tx) => {
            await tx.audit_logs.create({
                data: {
                    restaurant_id: user.restaurant_id,
                    staff_id: user.id,
                    action_type: 'STAFF_LOGIN',
                    entity_type: 'STAFF',
                    entity_id: user.id,
                    details: {
                        timestamp: lastLoginAt.toISOString(),
                    }
                }
            });
        });

        const duration = Date.now() - startTime;
        logger.log({
            level: LogLevel.INFO,
            service: 'auth',
            action: 'login_success',
            duration_ms: duration,
            staff_id: user.id,
            restaurant_id: user.restaurant_id,
            metadata: { role: user.role }
        });

        const sanitizedUser = {
            id: user.id,
            name: user.name,
            role: user.role,
            restaurant_id: user.restaurant_id,
            status: user.status,
            must_change_pin: user.must_change_pin === true,
            last_login: lastLoginAt
        };

        res.json({
            success: true,
            staff: sanitizedUser,
            restaurant: restaurant,
            tokens: {
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: 15 * 60
            }
        });

    } catch (e: any) {
        const duration = Date.now() - startTime;
        captureException(e, {
            endpoint: '/api/auth/login',
            duration_ms: duration
        });
        logger.log({
            level: LogLevel.ERROR,
            service: 'auth',
            action: 'login_error',
            duration_ms: duration,
            error: {
                message: e.message,
                code: e.code
            }
        });
        res.status(500).json({ error: 'Authentication service temporarily unavailable' });
    }
});

// --- NEW: RESTAURANT & STAFF REGISTRATION ---

/**
 * POST /api/restaurants
 * Provision a new restaurant with atomic onboarding
 */
app.post('/api/restaurants', platformAuthMiddleware, requirePlatformRole('PLATFORM_OWNER'), async (req, res) => {
    try {
        const { name, slug, phone, address, city, subscription_plan, subscription_status, owner_name, owner_email, owner_phone } = req.body;

        if (!name) return res.status(400).json({ error: 'Restaurant name is required' });
        if (!owner_name || !owner_email) return res.status(400).json({ error: 'Owner name and email are required' });

        const { restaurantProvisioningService } = await import('./services/onboarding/RestaurantProvisioningService');
        const result = await restaurantProvisioningService.provisionRestaurant({
            name,
            slug,
            phone: phone || owner_phone,
            address,
            city,
            subscriptionPlan: subscription_plan,
            subscriptionStatus: subscription_status,
            ownerName: owner_name,
            ownerEmail: owner_email,
            ownerPhone: owner_phone,
            actorId: req.platformUser?.id,
        });

        if (!result.success) {
            return res.status(400).json({ error: result.error || 'Provisioning failed' });
        }

        console.log(`[REGISTRATION] New restaurant provisioned: ${result.restaurant.name} (${result.restaurant.id})`);
        res.status(201).json({
            restaurant: result.restaurant,
            owner_staff: {
                id: result.ownerStaff.id,
                name: result.ownerStaff.name,
                role: result.ownerStaff.role,
            },
            message: 'Restaurant created successfully. Use the owner credentials to log in.',
        });
    } catch (error: any) {
        console.error('[ERROR] POST /api/restaurants:', error.message);
        res.status(500).json({ error: error.message || 'Failed to create restaurant' });
    }
});

// ==========================================
// PHASE 2: FIRST-LOGIN WIZARD CONTRACT
// ==========================================

/**
 * POST /api/auth/change-pin
 * Self-service PIN change. Allowlisted for restricted (must_change_pin /
 * SETUP_INCOMPLETE) sessions in the authMiddleware setup gate.
 * Clears must_change_pin and pin expiry on success.
 */
app.post('/api/auth/change-pin', verifyPinLimiter, authMiddleware, async (req, res) => {
    try {
        const { old_pin, new_pin } = req.body;
        if (typeof old_pin !== 'string' || typeof new_pin !== 'string') {
            return res.status(400).json({ error: 'old_pin and new_pin are required' });
        }
        if (!/^\d{6}$/.test(new_pin)) {
            return res.status(400).json({ error: 'new_pin must be exactly 6 digits' });
        }
        if (old_pin === new_pin) {
            return res.status(400).json({ error: 'New PIN must differ from the current PIN' });
        }

        const me = await prisma.staff.findUnique({
            where: { id: req.staffId },
            select: { id: true, hashed_pin: true, previous_hashed_pin: true, restaurant_id: true }
        });
        if (!me || !me.hashed_pin || !(await bcrypt.compare(old_pin, me.hashed_pin))) {
            await prisma.audit_logs.create({
                data: {
                    restaurant_id: me?.restaurant_id,
                    staff_id: me?.id,
                    action_type: 'STAFF_PIN_CHANGE_FAILED',
                    entity_type: 'STAFF',
                    entity_id: me?.id,
                    details: { reason: 'old_pin_mismatch' }
                }
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Phase 2 matrix: the new PIN must differ from the current AND the most
        // recent previous PIN (covers re-using a just-issued one-time PIN).
        if (await bcrypt.compare(new_pin, me.hashed_pin) ||
            (me.previous_hashed_pin && await bcrypt.compare(new_pin, me.previous_hashed_pin))) {
            return res.status(400).json({ error: 'New PIN must differ from recently used PINs' });
        }

        const newHash = await bcrypt.hash(new_pin, 12);
        await prisma.staff.update({
            where: { id: me.id },
            data: {
                hashed_pin: newHash,
                previous_hashed_pin: me.hashed_pin,
                pin: '',
                must_change_pin: false,
                pin_expires_at: null,
                failed_login_count: 0,
                locked_until: null
            }
        });

        await prisma.audit_logs.create({
            data: {
                restaurant_id: me.restaurant_id,
                staff_id: me.id,
                action_type: 'STAFF_PIN_CHANGED',
                entity_type: 'STAFF',
                entity_id: me.id,
                details: { self_service: true }
            }
        });

        res.json({ success: true });
    } catch (e: any) {
        console.error('[ERROR] POST /api/auth/change-pin:', e.message);
        res.status(500).json({ error: 'PIN change failed' });
    }
});

/**
 * GET /api/onboarding/status
 * Wizard state for the authenticated tenant (trusted claims only).
 */
app.get('/api/onboarding/status', authMiddleware, async (req, res) => {
    try {
        const [restaurant, me] = await Promise.all([
            prisma.restaurants.findUnique({
                where: { id: req.restaurantId },
                select: { onboarding_status: true, name: true, address: true, phone: true }
            }),
            prisma.staff.findUnique({
                where: { id: req.staffId },
                select: { must_change_pin: true }
            })
        ]);
        if (!restaurant) return res.status(404).json({ error: 'Tenant not found' });
        res.json({
            onboarding_status: restaurant.onboarding_status,
            requirements: {
                pin_change_required: me?.must_change_pin === true,
                profile_fields: {
                    name: !!restaurant.name,
                    address: !!restaurant.address,
                    phone: !!restaurant.phone
                }
            }
        });
    } catch (e: any) {
        console.error('[ERROR] GET /api/onboarding/status:', e.message);
        res.status(500).json({ error: 'Failed to load onboarding status' });
    }
});

/**
 * PATCH /api/onboarding/profile
 * Wizard profile step � allowlisted field set only.
 */
app.patch('/api/onboarding/profile', authMiddleware, requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const allowed: Record<string, unknown> = {};
        for (const f of ['name', 'address', 'phone'] as const) {
            if (typeof req.body[f] === 'string' && req.body[f].trim().length > 0) allowed[f] = req.body[f].trim();
        }
        if (Object.keys(allowed).length === 0) {
            return res.status(400).json({ error: 'No editable profile fields provided (name, address, phone)' });
        }
        if (allowed.name !== undefined && String(allowed.name).length < 2) {
            return res.status(400).json({ error: 'Restaurant name must be at least 2 characters' });
        }

        const updated = await prisma.restaurants.update({
            where: { id: req.restaurantId },
            data: { ...allowed, updated_at: new Date() },
            select: { id: true, name: true, address: true, phone: true, onboarding_status: true }
        });

        await prisma.audit_logs.create({
            data: {
                restaurant_id: req.restaurantId!,
                staff_id: req.staffId,
                action_type: 'ONBOARDING_PROFILE_UPDATED',
                entity_type: 'RESTAURANT',
                entity_id: req.restaurantId!,
                details: { fields: Object.keys(allowed) },
                performed_by_role: req.role
            }
        });

        res.json({ success: true, restaurant: updated });
    } catch (e: any) {
        console.error('[ERROR] PATCH /api/onboarding/profile:', e.message);
        res.status(500).json({ error: 'Profile update failed' });
    }
});

/**
 * POST /api/onboarding/complete
 * Transactional lifecycle transition SETUP_INCOMPLETE ? ACTIVE.
 * Replays refuse safely with 409; never demotes an active tenant.
 */
app.post('/api/onboarding/complete', authMiddleware, requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const me = await prisma.staff.findUnique({
            where: { id: req.staffId },
            select: { must_change_pin: true }
        });
        if (me?.must_change_pin === true) {
            return res.status(409).json({ error: 'Change your PIN before completing setup', code: 'PIN_CHANGE_REQUIRED' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const r = await tx.restaurants.findUnique({
                where: { id: req.restaurantId },
                select: { onboarding_status: true, name: true }
            });
            if (!r) throw Object.assign(new Error('Tenant not found'), { statusCode: 404 });
            if (!r.name || r.name.trim().length < 2) {
                throw Object.assign(new Error('Restaurant name is required before completing setup'), { statusCode: 400 });
            }
            const updated = await tx.restaurants.updateMany({
                where: { id: req.restaurantId!, onboarding_status: 'SETUP_INCOMPLETE' },
                data: { onboarding_status: 'ACTIVE', updated_at: new Date() }
            });
            if (updated.count === 0) {
                throw Object.assign(new Error('Setup already completed'), { statusCode: 409 });
            }
            await tx.audit_logs.create({
                data: {
                    restaurant_id: req.restaurantId!,
                    staff_id: req.staffId,
                    action_type: 'ONBOARDING_COMPLETED',
                    entity_type: 'RESTAURANT',
                    entity_id: req.restaurantId!,
                    details: {},
                    performed_by_role: req.role
                }
            });
            return true;
        });

        if (result) return res.json({ success: true, onboarding_status: 'ACTIVE' });
    } catch (e: any) {
        const code = e?.statusCode;
        if (code === 409) return res.status(409).json({ error: e.message, code: 'ALREADY_ACTIVE' });
        if (code === 404) return res.status(404).json({ error: e.message });
        if (code === 400) return res.status(400).json({ error: e.message });
        console.error('[ERROR] POST /api/onboarding/complete:', e.message);
        res.status(500).json({ error: 'Completion failed' });
    }
});

/**
 * POST /api/staff
 * Create a new staff record (Initial Owner or regular staff)
 */
app.post('/api/staff', authMiddleware, requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const { id, name, role, pin, status } = req.body;
        const restaurant_id = req.restaurantId;

        if (!restaurant_id || !name || !role || !pin) {
            return res.status(400).json({ error: 'Missing required staff fields' });
        }

        const staffData: any = {
            restaurant_id,
            name,
            role,
            pin,
            status: status || 'active'
        };
        if (id && typeof id === 'string' && id.trim().length > 0) {
            staffData.id = id.trim();
        }

        const staff = await prisma.staff.create({ data: staffData });

        console.log(`[REGISTRATION] Staff created: ${staff.name} as ${staff.role} for ${restaurant_id}`);
        const { pin: _pin, hashed_pin: _hashed_pin, ...sanitizedStaff } = staff;
        res.status(201).json(sanitizedStaff);
    } catch (error: any) {
        console.error('[ERROR] POST /api/staff:', error.message);
        res.status(500).json({ error: error.message || 'Failed to create staff' });
    }
});

/**
 * PATCH /api/staff
 * Update an existing staff record
 */
app.patch('/api/staff', authMiddleware, requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const { id, name, role, pin, status, active_tables, image } = req.body;

        if (!id) {
            return res.status(400).json({ error: 'Staff ID is required for update' });
        }

        const existing = await prisma.staff.findUnique({ where: { id } });
        if (!existing || existing.restaurant_id !== req.restaurantId) {
            return res.status(403).json({ error: 'Access denied: Staff does not belong to this restaurant' });
        }

        const staffData: any = {};
        if (name !== undefined) staffData.name = name;
        if (role !== undefined) staffData.role = role;
        if (pin !== undefined) staffData.pin = pin;
        if (status !== undefined) staffData.status = status;
        if (active_tables !== undefined) staffData.active_tables = active_tables;
        if (image !== undefined) staffData.image = image;

        const updatedStaff = await prisma.staff.update({
            where: { id },
            data: staffData
        });

        console.log(`[STAFF] Staff updated: ${updatedStaff.name} (${updatedStaff.id})`);
        const { pin: _pin, hashed_pin: _hashed_pin, ...sanitizedUpdated } = updatedStaff;
        res.json(sanitizedUpdated);
    } catch (error: any) {
        console.error('[ERROR] PATCH /api/staff:', error.message);
        res.status(500).json({ error: error.message || 'Failed to update staff' });
    }
});

/**
 * DELETE /api/staff
 * Delete a staff record
 */
app.delete('/api/staff', authMiddleware, requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const { id } = req.query;
        
        if (!id || typeof id !== 'string') {
            return res.status(400).json({ error: 'Staff ID is required for deletion' });
        }

        const existing = await prisma.staff.findUnique({ where: { id } });
        if (!existing || existing.restaurant_id !== req.restaurantId) {
            return res.status(403).json({ error: 'Access denied: Staff does not belong to this restaurant' });
        }

        await prisma.staff.delete({
            where: { id }
        });

        console.log(`[STAFF] Staff deleted: ${id}`);
        res.json({ success: true, message: 'Staff deleted successfully' });
    } catch (error: any) {
        console.error('[ERROR] DELETE /api/staff:', error.message);
        res.status(500).json({ error: error.message || 'Failed to delete staff' });
    }
});

/**
 * GET /api/restaurants
 * Fetch all restaurants (for super admin dashboard)
 */
app.get('/api/restaurants', authMiddleware, async (_req, res) => {
    try {
        const restaurants = await prisma.restaurants.findMany({
            select: {
                id: true,
                name: true,
                slug: true,
                phone: true,
                address: true,
                subscription_plan: true,
                subscription_status: true,
                created_at: true,
                updated_at: true,
                logo_url: true
            }
        });
        res.json(restaurants);
    } catch (error: any) {
        console.error('[ERROR] GET /api/restaurants:', error.message);
        res.status(500).json({ error: error.message || 'Failed to fetch restaurants' });
    }
});

/**
 * DELETE /api/restaurants/:id
 * Cleanup restaurant if registration fails or for deletion
 */
app.delete('/api/restaurants/:id', platformAuthMiddleware, requirePlatformRole('PLATFORM_OWNER'), async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.$transaction([
            prisma.staff.deleteMany({ where: { restaurant_id: id } }),
            prisma.license_keys.deleteMany({ where: { restaurant_id: id } }),
            prisma.restaurants.delete({ where: { id } }),
        ]);
        res.json({ success: true, message: 'Restaurant and all related data deleted' });
    } catch (error: any) {
        console.error('[ERROR] DELETE /api/restaurants/:id:', error.message);
        res.status(500).json({ error: error.message || 'Failed to delete restaurant' });
    }
});

/**
 * POST /api/auth/verify-pin
 * Verify a PIN for specific action authorization (Manager PIN override)
 */
app.post('/api/auth/verify-pin', verifyPinLimiter, authMiddleware, async (req, res) => {
    const { pin, requiredRole, staff_name } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const restaurantId = req.restaurantId;

    if (!pin || typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
        return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Mission 016B (F-SEC-1): manager overrides are tenant-bound. The tenant
    // comes exclusively from the authenticated context; candidates are matched
    // by bcrypt against stored hashes � the plaintext column is never read.
    if (!restaurantId) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    try {
        const nameFilter = typeof staff_name === 'string' && staff_name.trim().length > 0 ? staff_name.trim() : undefined;

        const candidates = await prisma.staff.findMany({
            where: {
                restaurant_id: restaurantId,
                status: 'active',
                hashed_pin: { not: null },
                ...(nameFilter ? { name: nameFilter } : {})
            },
            select: {
                id: true,
                name: true,
                role: true,
                restaurant_id: true,
                hashed_pin: true,
                failed_login_count: true,
                locked_until: true
            }
        });

        const now = new Date();
        const eligible = candidates.filter(c => !c.locked_until || c.locked_until <= now);

        let staff: (typeof eligible)[number] | null = null;
        for (const candidate of eligible) {
            try {
                if (candidate.hashed_pin && await bcrypt.compare(pin, candidate.hashed_pin)) {
                    staff = candidate;
                    break;
                }
            } catch (e) {
                await prisma.audit_logs.create({
                    data: {
                        restaurant_id: restaurantId,
                        staff_id: candidate.id,
                        action_type: 'STAFF_LOGIN_FAILED',
                        entity_type: 'STAFF',
                        entity_id: candidate.id,
                        details: {
                            reason: 'bcrypt_error',
                            context: 'verify-pin',
                            error: (e as Error).message,
                            ip_address: ipAddress
                        }
                    }
                });
            }
        }

        if (!staff) {
            if (eligible.length === 1) {
                const c = eligible[0];
                const newFailedCount = (c.failed_login_count || 0) + 1;
                const updateData: any = { failed_login_count: newFailedCount };

                if (newFailedCount >= 5) {
                    updateData.locked_until = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
                    await prisma.audit_logs.create({
                        data: {
                            restaurant_id: restaurantId,
                            staff_id: c.id,
                            action_type: 'STAFF_LOCKED',
                            entity_type: 'STAFF',
                            entity_id: c.id,
                            details: {
                                failed_count: newFailedCount,
                                locked_until: updateData.locked_until.toISOString(),
                                context: 'verify-pin',
                                ip_address: ipAddress
                            }
                        }
                    });
                }

                await prisma.staff.update({
                    where: { id: c.id },
                    data: updateData
                });

                await prisma.audit_logs.create({
                    data: {
                        restaurant_id: restaurantId,
                        staff_id: c.id,
                        action_type: 'STAFF_LOGIN_FAILED',
                        entity_type: 'STAFF',
                        entity_id: c.id,
                        details: {
                            reason: 'invalid_pin',
                            failed_count: newFailedCount,
                            context: 'verify-pin',
                            ip_address: ipAddress
                        }
                    }
                });
            } else {
                await prisma.audit_logs.create({
                    data: {
                        restaurant_id: restaurantId,
                        action_type: 'STAFF_LOGIN_FAILED',
                        entity_type: 'RESTAURANT',
                        entity_id: restaurantId,
                        details: {
                            reason: 'invalid_pin_multi_candidate',
                            context: 'verify-pin',
                            candidates: eligible.length,
                            ip_address: ipAddress
                        }
                    }
                });
            }

            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (requiredRole && staff.role !== requiredRole && staff.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Insufficient privileges for required role: ' + requiredRole });
        }

        await prisma.staff.update({
            where: { id: staff.id },
            data: { failed_login_count: 0, locked_until: null }
        });

        res.json({
            success: true,
            staff: {
                id: staff.id,
                name: staff.name,
                role: staff.role
            }
        });
    } catch (e: any) {
        res.status(500).json({ error: 'Verification failed' });
    }
});

/**
 * POST /api/auth/refresh
 * Generate new access token using refresh token
 * 
 * Request: { refresh_token: "jwt" }
 * Response: {
 *   access_token: "jwt",
 *   expires_in: 900
 * }
 * 
 * TODO (Phase 2c): Implement token rotation (rotate refresh token on use)
 * TODO (Phase 2c): Track refresh token usage to detect token reuse attacks
 */
app.post('/api/auth/refresh', async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token || typeof refresh_token !== 'string') {
        return res.status(400).json({ error: 'Missing refresh_token' });
    }

    try {
        const tokenHash = refreshTokenService.hashToken(refresh_token);
        const now = new Date();

        const existingToken = await prisma.refresh_tokens.findFirst({
            where: {
                token_hash: tokenHash,
                revoked_at: null,
                expires_at: { gt: now },
            },
            select: {
                id: true,
                token_family_id: true,
                staff_id: true,
                restaurant_id: true,
            },
        });

        if (!existingToken) {
            const isRevoked = await refreshTokenService.isTokenRevoked(refresh_token);
            if (isRevoked) {
                await refreshTokenService.revokeStaffRefreshTokenFamily(
                    (await prisma.refresh_tokens.findFirst({
                        where: { token_hash: tokenHash },
                        select: { token_family_id: true, staff_id: true },
                    }))?.token_family_id || '',
                    (await prisma.refresh_tokens.findFirst({
                        where: { token_hash: tokenHash },
                        select: { staff_id: true },
                    }))?.staff_id || ''
                );
                return res.status(401).json({
                    error: 'Refresh token reuse detected. All sessions have been revoked.',
                    code: 'TOKEN_REUSE_DETECTED'
                });
            }

            return res.status(401).json({
                error: 'Invalid or expired refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }

        const staff = await prisma.staff.findUnique({
            where: { id: existingToken.staff_id },
            select: { id: true, status: true, restaurant_id: true, role: true, name: true },
        });

        if (!staff || staff.status !== 'active') {
            return res.status(401).json({
                error: 'Staff member is no longer active',
                code: 'STAFF_INACTIVE'
            });
        }

        const restaurant = await prisma.restaurants.findFirst({
            where: { id: existingToken.restaurant_id },
            select: { is_active: true },
        });

        if (!restaurant || !restaurant.is_active) {
            return res.status(403).json({
                error: 'Restaurant is inactive',
                code: 'RESTAURANT_INACTIVE'
            });
        }

        const rotationResult = await refreshTokenService.rotateStaffRefreshToken(refresh_token);
        if (!rotationResult) {
            return res.status(500).json({ error: 'Token rotation failed' });
        }

        const newAccessToken = jwtService.generateAccessToken(
            staff.id,
            staff.restaurant_id,
            staff.role,
            staff.name
        );

        await prisma.audit_logs.create({
            data: {
                restaurant_id: staff.restaurant_id,
                staff_id: staff.id,
                action_type: 'REFRESH_TOKEN_ROTATED',
                entity_type: 'STAFF',
                entity_id: staff.id,
                details: {
                    token_family_id: rotationResult.familyId,
                    timestamp: new Date().toISOString(),
                },
            },
        });

        res.json({
            access_token: newAccessToken,
            refresh_token: rotationResult.newToken,
            expires_in: 15 * 60
        });

    } catch (error: any) {
        console.error('[ERROR] /api/auth/refresh:', error.message);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

/**
 * POST /api/auth/logout
 * Revoke tokens (placeholder for Phase 2c token blacklist)
 * 
 * TODO (Phase 2c): Implement token blacklist in Redis
 * For now, clients should discard tokens on logout
 */
app.post('/api/auth/logout', authMiddleware, async (req, res) => {
    const staffId = req.staffId;
    const { refresh_token } = req.body;

    if (!staffId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        // Mission 016B (F-SEC-4): logout is authoritative server-side. Revoke
        // the caller's active refresh-token family regardless of what the
        // client sends; an explicitly supplied refresh_token is revoked too.
        const activeSession = await prisma.refresh_tokens.findFirst({
            where: { staff_id: staffId, revoked_at: null, expires_at: { gt: new Date() } },
            orderBy: { created_at: 'desc' },
            select: { token_family_id: true },
        });
        let familyRevokedCount = 0;
        if (activeSession?.token_family_id) {
            familyRevokedCount = await refreshTokenService.revokeStaffRefreshTokenFamily(activeSession.token_family_id, staffId);
        }
        if (refresh_token) {
            await refreshTokenService.revokeStaffRefreshToken(refresh_token);
        }

        await prisma.audit_logs.create({
            data: {
                restaurant_id: req.restaurantId,
                staff_id: staffId,
                action_type: 'STAFF_LOGOUT',
                entity_type: 'STAFF',
                entity_id: staffId,
                details: {
                    timestamp: new Date().toISOString(),
                    refresh_token_revoked: !!refresh_token,
                    family_revoked_sessions: familyRevokedCount,
                }
            }
        });

        res.json({ success: true, message: 'Logged out successfully' });

    } catch (error: any) {
        console.error('[ERROR] /api/auth/logout:', error.message);
        res.status(500).json({ error: 'Logout failed' });
    }
});


// ==========================================
// ⚙︝ 2. OPERATIONAL ROUTES (SPECIFIC)
// ==========================================

// Get operations config for a restaurant
app.get('/api/operations/config/:restaurantId', authMiddleware, async (req, res) => {
    const { restaurantId } = req.params;

    // SaaS Security: Only allow fetching config for own restaurant
    if (req.restaurantId !== restaurantId) {
        return res.status(403).json({ error: 'Access denied: Cannot access configuration for another restaurant' });
    }

    try {
        // Fetch actual order type defaults from DB
        const dbDefaults = await prisma.order_type_defaults.findMany({
            where: { restaurant_id: restaurantId }
        });

        const order_type_defaults = dbDefaults.reduce((acc, curr) => {
            acc[curr.order_type] = {
                tax_rate: Number(curr.tax_rate),
                tax_type: curr.tax_type,
                tax_enabled: curr.tax_enabled,
                svc_rate: Number(curr.svc_rate),
                svc_enabled: curr.svc_enabled,
                delivery_fee: Number(curr.delivery_fee),
                discount_max: Number(curr.discount_max),
                tax_exempt: false
            };
            return acc;
        }, {} as any);

        res.json({
            success: true,
            config: {
                order_type_defaults,
                taxEnabled: false,
                taxRate: 0,
                serviceChargeEnabled: false,
                serviceChargeRate: 5,
                defaultDeliveryFee: 250,
                defaultGuestCount: 2,
                defaultRiderFloat: 5000

            }
        });
    } catch (e: any) {
        console.error('Get operations config error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Get restaurant identity/profile
app.get('/api/restaurants/:restaurantId/profile', authMiddleware, async (req, res) => {
    try {
        const { restaurantId } = req.params;
        const restaurant = await prisma.restaurants.findUnique({
            where: { id: restaurantId },
            select: { name: true, address: true, phone: true, fbr_ntn: true }
        });
        
        if (!restaurant) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }
        
        res.json({ success: true, restaurant });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Save restaurant identity/profile
app.patch('/api/restaurants/:restaurantId/profile', 
  authMiddleware, 
  requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { name, address, phone, tax_number } = req.body;
      
      const updated = await prisma.restaurants.update({
        where: { id: restaurantId },
        data: {
          ...(name && { name }),
          ...(address && { address }),
          ...(phone && { phone }),
          ...(tax_number && { fbr_ntn: tax_number })
        }
      });
      
      res.json({ success: true, restaurant: updated });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

// Save operations config for a restaurant
app.patch('/api/operations/config/:restaurantId', authMiddleware, async (req, res) => {
    const { restaurantId } = req.params;

    // SaaS Security: Only allow updating own restaurant config
    if (req.restaurantId !== restaurantId) {
        return res.status(403).json({ error: 'Access denied: Cannot update configuration for another restaurant' });
    }

    try {
        const {
            taxEnabled,
            taxRate,
            serviceChargeEnabled,
            serviceChargeRate,
            defaultDeliveryFee,
            defaultGuestCount,
            defaultRiderFloat,
            // Floor Management
            allowOverCapacity,
            maxOverCapacityGuests,
            enableTableMerging
        } = req.body;

        // Verify restaurant exists
        const restaurant = await prisma.restaurants.findUnique({
            where: { id: restaurantId },
            select: { id: true }
        });

        if (!restaurant) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        // TODO: When adding operations_config table, save config there
        // For now, just acknowledge the save
        const config = {
            taxEnabled: Boolean(taxEnabled),
            taxRate: Number(taxRate) || 0,
            serviceChargeEnabled: Boolean(serviceChargeEnabled),
            serviceChargeRate: Number(serviceChargeRate) || 0,
            defaultDeliveryFee: Number(defaultDeliveryFee) || 250,
            defaultGuestCount: Math.max(1, Math.min(20, Number(defaultGuestCount) || 2)),
            defaultRiderFloat: Number(defaultRiderFloat) || 5000,
            // Floor Management
            allowOverCapacity: allowOverCapacity !== undefined ? Boolean(allowOverCapacity) : true,
            maxOverCapacityGuests: Number(maxOverCapacityGuests) || 3,
            enableTableMerging: Boolean(enableTableMerging)
        };

        io.to(`restaurant:${req.restaurantId}`).emit('config:updated', { restaurantId, config });

        res.json({
            success: true,
            message: 'Configuration saved successfully',
            config
        });
    } catch (e: any) {
        console.error('Update operations config error:', e);
        res.status(500).json({ error: e.message });
    }
});

// GET order-settings (OrderDefaults configs from Prisma)
app.get('/api/operations/order-settings', authMiddleware, async (req, res) => {
    try {
        const defaults = await prisma.order_type_defaults.findMany({
            where: { restaurant_id: req.restaurantId }
        });
        res.json({ success: true, settings: defaults });
    } catch (e: any) {
        console.error('Get order settings error:', e);
        res.status(500).json({ error: e.message });
    }
});

// PATCH order-settings
app.patch('/api/operations/order-settings', authMiddleware, async (req, res) => {
    try {
        const { settings } = req.body;
        
        // Save operational defaults (if the table exists, else we simulate it or ignore)
        // E.g., we can update restaurants table if those columns existed, 
        // but for now let's just update order_type_defaults
        
        if (settings) {
            for (const [orderType, config] of Object.entries(settings) as any) {
                const existing = await prisma.order_type_defaults.findFirst({
                    where: { restaurant_id: req.restaurantId, order_type: orderType }
                });
                if (existing) {
                    await prisma.order_type_defaults.update({
                        where: { id: existing.id },
                        data: {
                            tax_enabled: config.tax_enabled,
                            tax_rate: config.tax_rate.toString(),
                            tax_type: config.tax_type,
                            svc_enabled: config.svc_enabled,
                            svc_rate: config.svc_rate.toString(),
                            discount_max: config.discount_max.toString(),
                            delivery_fee: config.delivery_fee?.toString() || '0'
                        }
                    });
                } else {
                    await prisma.order_type_defaults.create({
                        data: {
                            restaurant_id: req.restaurantId!,
                            order_type: orderType,
                            tax_enabled: config.tax_enabled,
                            tax_rate: config.tax_rate.toString(),
                            tax_type: config.tax_type,
                            svc_enabled: config.svc_enabled,
                            svc_rate: config.svc_rate.toString(),
                            discount_max: config.discount_max.toString(),
                            delivery_fee: config.delivery_fee?.toString() || '0'
                        }
                    });
                }
            }
        }
        res.json({ success: true, message: 'Settings saved' });
    } catch (e: any) {
        console.error('Patch order settings error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ==========================================

// ✅ FIXED: Upsert route prioritized to handle order creation and table status
app.post('/api/orders/upsert', authMiddleware, async (req, res) => {
    try {
        const data = req.body;
        if (!data.type) return res.status(400).json({ error: 'Order type is required' });

        // SaaS Security: Force tenant isolation
        data.restaurant_id = req.restaurantId;
        data.restaurantId = req.restaurantId;

        const service = OrderServiceFactory.getService(data.type);
        let result;

        if (data.id) {
            result = await service.updateOrder(req.restaurantId!, data.id, data);
        } else {
            result = await service.createOrder(data);
        }

        // Logic to update table status if it is a DINE_IN order
        if (data.type === 'DINE_IN' && data.table_id) {
            await prisma.tables.update({
                where: { id: data.table_id },
                data: {
                    status: 'OCCUPIED',
                    active_order_id: result.id
                }
            });
        }

        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'orders', eventType: 'UPDATE', data: result });
        res.json(result);
    } catch (e: any) {
        console.error("Order Upsert Error:", e);
        res.status(500).json({ error: e.message });
    }
});



// New simplified Order CRUD for POS
app.post('/api/orders', authMiddleware, async (req, res) => {
    try {
        const data = req.body;
        if (!data.type) return res.status(400).json({ error: 'Order type is required' });

        // SaaS Security: Force tenant isolation
        data.restaurant_id = req.restaurantId;
        data.restaurantId = req.restaurantId;

        const service = OrderServiceFactory.getService(data.type);
        const result = await service.createOrder(data);

        res.json(result);
    } catch (e: any) {
        console.error("POST /api/orders error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/orders/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        if (data.status === 'CANCELLED' || data.status === 'VOIDED') {
            if (req.role !== 'MANAGER' && req.role !== 'ADMIN' && req.role !== 'SUPER_ADMIN') {
                return res.status(403).json({ error: 'Insufficient permissions for void/cancel', code: 'INSUFFICIENT_PERMISSION' });
            }
        }

        // SaaS Security: Force tenant isolation verify
        const order = await prisma.orders.findUnique({
            where: {
                id,
                restaurant_id: req.restaurantId
            }
        });

        if (!order) return res.status(404).json({ error: 'Order not found or unauthorized' });

        if (!data.type) data.type = order.type;

        if (data.refund_transaction_id || data.void_notes) {
            return res.status(403).json({ error: 'Refund state cannot be set through generic order update', code: 'REFUND_BOUNDARY_VIOLATION' });
        }

        const service = OrderServiceFactory.getService(data.type);
        const result = await service.updateOrder(req.restaurantId!, id, data);

        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'orders', eventType: 'UPDATE', data: result });
        res.json(result);
    } catch (e: any) {
        console.error("PATCH /api/orders error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/orders/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const order = await prisma.orders.findUnique({
            where: {
                id,
                restaurant_id: req.restaurantId // SaaS Security
            }
        });
        if (!order) return res.status(404).json({ error: 'Order not found or unauthorized' });

        const service = OrderServiceFactory.getService(order.type as any);
        const success = await service.deleteOrder(req.restaurantId!, id);

        if (success) {
            io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'orders', eventType: 'DELETE', id });
            // If it was a DINE_IN order, also notify about table change
            if (order.type === 'DINE_IN' && order.table_id) {
                io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'tables', eventType: 'UPDATE', id: order.table_id, data: { status: 'AVAILABLE', active_order_id: null } });
            }
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    } catch (e: any) {
        console.error("DELETE /api/orders error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Settle Order (Payment)
app.post('/api/orders/:id/settle', authMiddleware, sessionGateMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            paymentMethod, payment_method,
            tax, service_charge, discount, delivery_fee, total,
            payments // array of { method, amount } for split payments
        } = req.body;
        const staffId = req.staffId;

        // sessionGateMiddleware guarantees cashierSession is valid and OPEN
        const sessionId = (req as any).cashierSession?.id || (req.headers['x-session-id'] as string);

        // Build normalised payment lines — support both single and split-payment submissions
        const paymentLines: Array<{ method: string; amount: number }> = Array.isArray(payments) && payments.length > 0
            ? payments.map((p: any) => ({ method: p.method || p.payment_method || 'CASH', amount: Number(p.amount) }))
            : [{ method: paymentMethod || payment_method || 'CASH', amount: Number(total || req.body.amount) }];

        const totalReceived = paymentLines.reduce((s, l) => s + l.amount, 0);
        if (!totalReceived || totalReceived <= 0) {
            return res.status(400).json({ error: 'Valid payment amount required' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const order = await tx.orders.findFirst({
                where: { id, restaurant_id: req.restaurantId } // SaaS Security
            });
            if (!order) throw new Error('Order not found or unauthorized');

            const isLogisticsSettle = req.body.source === 'LOGISTICS';
            if (order.type === 'DELIVERY' && !isLogisticsSettle) {
                throw Object.assign(new Error('Delivery orders must be settled via the Logistics Hub, not through POS.'), { code: 'DELIVERY_LOGISTICS_ONLY', status: 422 });
            }

            // 1. Update Order — persist final bill figures and link to cashier session
            const updatedOrder = await tx.orders.update({
                where: { id },
                data: {
                    status: 'CLOSED',
                    payment_status: 'PAID',
                    closed_at: new Date(),
                    session_id: sessionId || undefined,
                    last_action_by: staffId || order.last_action_by || undefined,
                    last_action_at: new Date(),
                    ...(total !== undefined && { total: Number(total) }),
                    ...(tax !== undefined && { tax: Number(tax) }),
                    ...(service_charge !== undefined && { service_charge: Number(service_charge) }),
                    ...(discount !== undefined && { discount: Number(discount) }),
                    ...(delivery_fee !== undefined && { delivery_fee: Number(delivery_fee) })
                }
            });

            // 2. Create one Transaction record per payment line (supports split payments)
            const txRef = `POS-${Date.now()}`;
            for (const line of paymentLines) {
                await tx.transactions.create({
                    data: {
                        restaurant_id: order.restaurant_id,
                        order_id: order.id,
                        amount: line.amount,
                        payment_method: line.method,
                        status: 'PAID',
                        transaction_ref: `${txRef}-${line.method}`
                    }
                });
            }

            // 3. Clear Table (if Dine-In)
            if (order.type === 'DINE_IN' && order.table_id) {
                await tx.tables.update({
                    where: { id: order.table_id },
                    data: { status: 'DIRTY', active_order_id: null }
                });
            }

            // 4. Accounting entry
            if (isLogisticsSettle) {
                // Delivery settled via Logistics Hub:
                // Revenue already posted when order was assigned to rider
                // Just clear the rider receivable: DR Cash, CR Rider Receivable
                await journalEntryService.recordRiderSettlementJournal({
                    restaurantId: order.restaurant_id,
                    riderId: order.assigned_driver_id || '',
                    amount: totalReceived,
                    settlementId: order.id,
                    processedBy: req.staffId
                }, tx);

                // Also create ledger entry so Calculated Cash updates correctly
                await accounting.createLedgerEntry({
                    restaurantId: order.restaurant_id,
                    transactionType: 'DEBIT',
                    amount: totalReceived,
                    referenceType: 'SETTLEMENT',
                    referenceId: order.id,
                    description: `Delivery order settled via Logistics Hub`,
                    processedBy: req.staffId
                }, tx);
            } else {
                // Normal sale — Dine-In, Takeaway
                await accounting.recordOrderSale(order.id, order.restaurant_id, tx, {
                    amount: totalReceived,
                    paymentMethod: paymentLines[0].method
                });
            }

            return updatedOrder;
        });

        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'orders', eventType: 'UPDATE', data: result, id });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'transactions', eventType: 'INSERT' });
        if (result.type === 'DINE_IN' && result.table_id) {
            io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'tables', eventType: 'UPDATE', id: result.table_id, data: { id: result.table_id, status: 'DIRTY', active_order_id: null } });
        }

        res.json({ success: true, order: result });
    } catch (e: any) {
        console.error("Order Settle Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Floor Management: Seat Party
app.post('/api/floor/seat-party', authMiddleware, async (req, res) => {
    try {
        const {
            guestCount,
            customerName,
            waiterId,
            preferredSectionId,
            allowOverCapacity,
            tableId
        } = req.body;

        const restaurantId = req.restaurantId; // SaaS Security: Enforce tenant

        if (!restaurantId || !guestCount || !waiterId) {
            return res.status(400).json({ error: 'Missing required fields (guestCount, waiterId)' });
        }

        const result = await seatPartyWithCapacityCheck(
            restaurantId,
            guestCount,
            customerName || 'Guest',
            waiterId,
            io,
            preferredSectionId,
            allowOverCapacity !== undefined ? allowOverCapacity : true,
            tableId
        );
        res.json(result);
    } catch (e: any) {
        console.error("Seat Party Error:", e);
        console.error("Seat Party Stack:", e?.stack);
        console.error("Seat Party Code:", e?.code);
        console.error("Seat Party Meta:", JSON.stringify(e?.meta));
        res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' });
    }
});

/**
 * Express middleware to prevent operations if restaurant subscription is expired or tampered.
 */
async function verifyLicensingMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    try {
        const restaurantId = req.restaurantId;
        if (!restaurantId || restaurantId === 'SYSTEM') {
            return next(); // Skip check for system internal operations
        }

        if (process.env.NODE_ENV === 'test') {
            return next(); // Skip licensing checks in test environment
        }

        const verification = await LicenseService.evaluateLocalLicenseStatus(restaurantId);
        if (verification.status !== 'active') {
            return res.status(402).json({
                error: 'LICENSING_LOCKOUT',
                status: verification.status,
                message: verification.error || 'Your FireFlow license is inactive or expired.'
            });
        }
        next();
    } catch (e: any) {
        console.error('[LICENSING MIDDLEWARE] Validation crash:', e.message);
        res.status(500).json({ error: 'License verification service failed' });
    }
}

// ─── Enterprise Route Guard ────────────────────────────────────────────────
// authMiddleware is applied ONCE on the shared protectedApiRouter.
// Previously each app.use() call added its own authMiddleware instance,
// causing JWT verification to run 3× per request and flooding logs with
// duplicate [AUTH] entries. Now it runs exactly once per request.
const protectedApiRouter = express.Router();
protectedApiRouter.use(authMiddleware);
protectedApiRouter.use(verifyLicensingMiddleware);

protectedApiRouter.use('/', deliveryRoutes);
protectedApiRouter.use('/', customerRoutes);
protectedApiRouter.use('/analytics', analyticsRoutes);  // moved from standalone app.use below
protectedApiRouter.use('/accounting/coa', coaRoutes);   // must be before /accounting
protectedApiRouter.use('/accounting', accountingRoutes);
protectedApiRouter.use('/reports', reportRoutes);
protectedApiRouter.use('/orders', orderWorkflowRoutes);
protectedApiRouter.use('/cashier', cashierRoutes);
protectedApiRouter.use('/suppliers', supplierRoutes);
protectedApiRouter.use('/finance', financeRoutes);
protectedApiRouter.use('/super-admin', superAdminRoutes);
protectedApiRouter.use('/printers', printerRoutes);

// New unified print endpoint
import { PrinterService } from './services/PrinterService';
protectedApiRouter.post('/print', async (req, res) => {
    try {
        const { printerId, html } = req.body;
        if (!printerId || !html) {
            return res.status(400).json({ error: 'printerId and html are required' });
        }
        await PrinterService.printDocument(printerId, req.restaurantId!, html);
        res.json({ success: true });
    } catch (e: any) {
        console.error('Print error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Fiscal connector service routes � HMAC authenticated, separate from tenant JWT boundary
app.use('/api/fiscal-connector', fiscalConnectorRoutes);

// Platform authentication rate limiters
const platformLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => req.ip || 'unknown',
    message: 'Too many platform login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
});

const platformResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    keyGenerator: (req) => req.ip || 'unknown',
    message: 'Too many reset requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
});

const platformResetConfirmLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => req.ip || 'unknown',
    message: 'Too many reset attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
});

const platformCreateAccountLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => req.ip || 'unknown',
    message: 'Too many account creation attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
});

// Platform authentication routes � separate from platform admin routes
const platformAuthRouter = Router();

platformAuthRouter.post('/login', platformLoginLimiter, async (req, res) => {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'];

    if (!email || !password) {
        return res.status(400).json({ error: 'Invalid credentials' });
    }

    try {
        const result = await platformAuthService.authenticate(email, password, ipAddress, userAgent);
        if (!result.valid) {
            return res.status(401).json({ error: result.error || 'Invalid credentials' });
        }

        res.json({
            success: true,
            user: result.user,
            tokens: {
                access_token: result.access_token,
                refresh_token: result.refresh_token,
                expires_in: 15 * 60,
            },
            must_change_password: result.must_change_password,
        });
    } catch (e: any) {
        logger.log({
            level: LogLevel.ERROR,
            service: 'platform-auth',
            action: 'login_error',
            error: { message: e.message },
        });
        res.status(500).json({ error: 'Authentication service temporarily unavailable' });
    }
});

platformAuthRouter.post('/logout', platformAuthMiddleware, async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(400).json({ error: 'Invalid credentials' });
    }

    try {
        const decoded = platformJwtService.verifyToken(token);
        if (!decoded.valid || !decoded.payload) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        await platformAuthService.revokeSession(decoded.payload.jti);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: 'Logout failed' });
    }
});

platformAuthRouter.post('/refresh', async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token || typeof refresh_token !== 'string') {
        return res.status(400).json({ error: 'Missing refresh_token' });
    }

    try {
        const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
        const now = new Date();

        const existingSession = await prisma.platform_sessions.findFirst({
            where: {
                refresh_token_hash: tokenHash,
                revoked_at: null,
                expires_at: { gt: now },
            },
            select: {
                id: true,
                token_family_id: true,
                platform_user_id: true,
            },
        });

        if (!existingSession) {
            const revokedSession = await prisma.platform_sessions.findFirst({
                where: { refresh_token_hash: tokenHash },
                select: { token_family_id: true, platform_user_id: true },
            });

            if (revokedSession && revokedSession.token_family_id) {
                await platformAuthService.revokePlatformTokenFamily(revokedSession.token_family_id, revokedSession.platform_user_id);
                return res.status(401).json({
                    error: 'Refresh token reuse detected. All sessions have been revoked.',
                    code: 'TOKEN_REUSE_DETECTED'
                });
            }

            return res.status(401).json({
                error: 'Invalid or expired refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }

        const user = await prisma.platform_users.findUnique({
            where: { id: existingSession.platform_user_id },
            select: { id: true, status: true, role: true, name: true, email: true },
        });

        if (!user || user.status !== 'ACTIVE') {
            return res.status(401).json({
                error: 'Account is inactive',
                code: 'ACCOUNT_INACTIVE'
            });
        }

        const rotationResult = await platformAuthService.rotatePlatformRefreshToken(refresh_token, req.headers['user-agent']);
        if (!rotationResult) {
            return res.status(500).json({ error: 'Token rotation failed' });
        }

        const newAccessToken = platformJwtService.generateAccessToken(
            user.id,
            user.role,
            false,
            15,
            rotationResult.newSessionJti
        );

        await prisma.audit_logs.create({
            data: {
                action_type: 'PLATFORM_REFRESH_TOKEN_ROTATED',
                entity_type: 'PLATFORM_USER',
                entity_id: user.id,
                details: {
                    new_session_jti: rotationResult.newSessionJti,
                },
            },
        });

        res.json({
            access_token: newAccessToken,
            refresh_token: rotationResult.newToken,
            expires_in: 15 * 60
        });

    } catch (e: any) {
        console.error('[ERROR] /api/platform/auth/refresh:', e.message);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

platformAuthRouter.post('/change-password', platformAuthMiddleware, async (req, res) => {
    const { current_password, new_password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Invalid credentials' });
    }

    try {
        const result = await platformAuthService.changePassword(
            req.platformUser!.id,
            current_password,
            new_password,
            ipAddress
        );
        if (!result.success) {
            return res.status(400).json({ error: result.error || 'Password change failed' });
        }
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: 'Password change failed' });
    }
});

platformAuthRouter.post('/request-reset', platformResetLimiter, async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Invalid credentials' });
    }

    try {
        const result = await platformAuthService.requestPasswordReset(email);
        res.json({ success: true, message: result.message });
    } catch (e: any) {
        res.status(500).json({ error: 'Reset request failed' });
    }
});

platformAuthRouter.post('/reset-password', platformResetConfirmLimiter, async (req, res) => {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
        return res.status(400).json({ error: 'Invalid credentials' });
    }

    try {
        const result = await platformAuthService.resetPassword(token, new_password);
        if (!result.success) {
            return res.status(400).json({ error: result.error || 'Password reset failed' });
        }
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: 'Password reset failed' });
    }
});

platformAuthRouter.post('/create-account', platformCreateAccountLimiter, platformAuthMiddleware, requirePlatformRole('PLATFORM_OWNER'), async (req, res) => {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name || !role) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const result = await platformAuthService.createAccount(
            { email, password, name, role: role as any },
            req.platformUser!.id
        );
        if (!result.success) {
            return res.status(400).json({ error: result.error || 'Account creation failed' });
        }
        res.status(201).json({ success: true, user: result.user });
    } catch (e: any) {
        res.status(500).json({ error: 'Account creation failed' });
    }
});

app.use('/api/platform/auth', platformAuthRouter);

// Platform control plane routes � separate auth boundary
app.use('/api/platform', platformRoutes);

app.use('/api', protectedApiRouter);

// Standalone subscription_payments route — queries Supabase cloud (table not in local DB)
app.get('/api/subscription_payments', authMiddleware, requireRole('SUPER_ADMIN', 'MANAGER'), async (_req, res) => {
    try {
        const { getSupabaseClient } = await import('../shared/lib/cloudClient');
        const cloud = getSupabaseClient();
        const { data, error } = await cloud
            .from('subscription_payments')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        res.json(data || []);
    } catch (e: any) {
        console.error('[SUPER ADMIN] GET /subscription_payments error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * PATCH /api/orders/:id/guest-count
 * Update guest count with capacity check
 */
app.patch('/api/orders/:id/guest-count', async (req, res) => {
    const { id } = req.params;
    const { guest_count, allow_over_capacity = true } = req.body;
    const staffId = req.headers['x-staff-id'] as string;

    if (!guest_count || guest_count < 1) {
        return res.status(400).json({ error: 'Valid guest count required (minimum 1)' });
    }

    try {
        const result = await updateGuestCount(
            req.restaurantId!,
            id,
            guest_count,
            staffId || 'SYSTEM',
            io,
            allow_over_capacity
        );

        res.json(result);
    } catch (error: any) {
        console.error('Failed to update guest count:', error);
        res.status(error.message.includes('Cannot update') ? 403 : 500)
            .json({ error: error.message });
    }
});

// ✅ FIXED: Dev Reset route using prisma transaction for atomic wipe
app.post('/api/system/dev-reset', authMiddleware, async (req, res) => {
    // SaaS Security: Only allow reset for own restaurant data!
    const restaurant_id = req.restaurantId;

    // Optional: Only allow SUPER_ADMIN to reset?
    if (req.role !== 'SUPER_ADMIN' && req.role !== 'MANAGER') {
        return res.status(403).json({ error: 'Privileged action: Manager or Admin required for system reset' });
    }

    try {
        await prisma.$transaction([
            prisma.order_items.deleteMany({ where: { orders: { restaurant_id } } }),
            prisma.transactions.deleteMany({ where: { restaurant_id } }),
            prisma.dine_in_orders.deleteMany({ where: { orders: { restaurant_id } } }),
            prisma.takeaway_orders.deleteMany({ where: { orders: { restaurant_id } } }),
            prisma.delivery_orders.deleteMany({ where: { orders: { restaurant_id } } }),
            prisma.reservation_orders.deleteMany({ where: { orders: { restaurant_id } } }),
            prisma.order_intelligence.deleteMany({ where: { orders: { restaurant_id } } }),
            prisma.orders.deleteMany({ where: { restaurant_id } }),
            // Reset tables to AVAILABLE (Green) and clear linked orders
            prisma.tables.updateMany({
                where: { restaurant_id },
                data: {
                    status: 'AVAILABLE',
                    active_order_id: null
                }
            })
        ]);
        console.log(`🔄 System Reset: Transactional data cleared for restaurant ${restaurant_id}.`);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 📊 3. ANALYTICS
// ==========================================
// analyticsRoutes is now mounted via protectedApiRouter above.
// Inline handlers below inherit auth from protectedApiRouter — no duplicate authMiddleware needed.

app.get('/api/analytics/summary', async (req, res) => {
    if (!req.restaurantId) {
        return res.status(400).json({ error: 'Missing restaurant context' });
    }
    const restaurant_id = req.restaurantId; // SaaS Security
    try {
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }); // YYYY-MM-DD in PKT
        const { start: todayStart, end: todayEnd } = await toUTCRange(restaurant_id, todayStr);

        // Revenue
        const todayOrders = await prisma.orders.findMany({
            where: {
                restaurant_id, // SaaS Security
                created_at: { gte: todayStart, lte: todayEnd },
                status: { in: ['CLOSED', 'DELIVERED'] }
            }
        });
        const revenue = todayOrders.reduce((sum: number, o: any) => sum + Number(o.total), 0);

        const breakdown = {
             dineIn: 0, takeaway: 0, delivery: 0, tax: 0, serviceCharge: 0, discount: 0
        };
        todayOrders.forEach((o: any) => {
            if (o.type === 'DINE_IN') breakdown.dineIn += Number(o.total || 0);
            if (o.type === 'TAKEAWAY') breakdown.takeaway += Number(o.total || 0);
            if (o.type === 'DELIVERY') breakdown.delivery += Number(o.total || 0);
            breakdown.tax += Number(o.tax || 0);
            breakdown.serviceCharge += Number(o.service_charge || 0);
            breakdown.discount += Number(o.discount || 0);
        });

        // Top Items
        const items = await prisma.order_items.findMany({
            where: {
                orders: {
                    restaurant_id, // SaaS Security
                    created_at: { gte: todayStart, lte: todayEnd },
                    status: { in: ['CLOSED', 'DELIVERED'] }
                }
            },
            include: { menu_items: true }
        });

        const itemCounts: Record<string, number> = {};
        items.forEach((i: any) => {
            if (i.menu_items) {
                itemCounts[i.menu_items.name] = (itemCounts[i.menu_items.name] || 0) + i.quantity;
            }
        });

        const topItems = Object.entries(itemCounts)
            .map(([name, qty]) => ({ name, qty }))
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);

        // Additional live stats for the robust V3 Dashboard
        const activeOrdersList = await prisma.orders.findMany({
            where: {
                restaurant_id,
                status: { notIn: ['CLOSED', 'CANCELLED', 'VOIDED'] }
            },
            include: { order_items: true }
        });

        const activeOrders = activeOrdersList.length;
        let kitchenQueue = 0;
        let totalGuests = 0;
        const statusBreakdown: Record<string, number> = {};

        activeOrdersList.forEach((o: any) => {
            statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
            if (o.party_size) {
                totalGuests += o.party_size;
            }
            if (o.order_items) {
                o.order_items.forEach((i: any) => {
                    if (['PENDING', 'PREPARING'].includes(i.item_status)) {
                        kitchenQueue += i.quantity || 1;
                    }
                });
            }
        });

        const unitAverage = todayOrders.length > 0 ? Math.round(revenue / todayOrders.length) : 0;

        // v3.0 analytics logic
        try {
            const result = {
                totalSales: revenue,
                totalTransactions: todayOrders.length,
                unitAverage,
                activeOrders,
                kitchenQueue,
                totalGuests,
                statusBreakdown,
                topItems,
                breakdown
            };
            res.json(result);
        } catch (e: any) {
            console.error('Analytics Error:', e);
            res.status(500).json({ error: e.message });
        }
    } catch (e: any) {
        console.error('Analytics Fetch Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/analytics/sales/hourly', async (req, res) => {
    const restaurant_id = req.restaurantId; // SaaS Security
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const salesAgg = await prisma.transactions.aggregate({
            where: { 
                restaurant_id: String(restaurant_id),
                created_at: {
                    gte: todayStart
                }
            },
            _sum: { amount: true },
            _count: { id: true }
        });

        // v3.0 analytics logic
        const activeOrdersCount = await prisma.orders.count({
            where: {
                restaurant_id: String(restaurant_id),
                status: 'ACTIVE',
                created_at: {
                    gte: new Date(todayStart.getTime() - 24 * 60 * 60 * 1000) // Look back 24h for active orders
                }
            }
        });

        // Calculate breakdown
        const ordersForBreakdown = await prisma.orders.findMany({
            where: {
                restaurant_id: String(restaurant_id),
                status: 'CLOSED', // ONLY paid orders
                created_at: {
                     gte: todayStart // Today
                }
            }
        });

        const breakdown = {
             dineIn: 0, takeaway: 0, delivery: 0, tax: 0, serviceCharge: 0, discount: 0
        };
        ordersForBreakdown.forEach(o => {
            if (o.type === 'DINE_IN') breakdown.dineIn += Number(o.total || 0);
            if (o.type === 'TAKEAWAY') breakdown.takeaway += Number(o.total || 0);
            if (o.type === 'DELIVERY') breakdown.delivery += Number(o.total || 0);
            breakdown.tax += Number(o.tax || 0);
            breakdown.serviceCharge += Number(o.service_charge || 0);
            breakdown.discount += Number(o.discount || 0);
        });

        // --- NEW: LOGISTICS ANALYTICS ---
        const onRoadCount = await prisma.orders.count({
            where: {
                restaurant_id: String(restaurant_id),
                status: 'READY' // In our flow, READY means out for delivery
            }
        });

        const activeShiftsCount = await prisma.rider_shifts.count({
            where: {
                restaurant_id: String(restaurant_id),
                status: 'OPEN'
            }
        });

        const deliveredTodayCount = await prisma.orders.count({
            where: {
                restaurant_id: String(restaurant_id),
                status: 'DELIVERED',
                created_at: {
                    gte: new Date(new Date().setHours(0, 0, 0, 0))
                }
            }
        });

        // Get active order IDs first, then count their pending items
        const activeOrderIds = await prisma.orders.findMany({
            where: {
                restaurant_id: String(restaurant_id),
                status: 'ACTIVE'
            },
            select: { id: true }
        });

        const kitchenQueueCount = activeOrderIds.length > 0 ? await prisma.order_items.count({
            where: {
                order_id: {
                    in: activeOrderIds.map(o => o.id)
                },
                item_status: 'PENDING'
            }
        }) : 0;

        res.json({
            totalSales: Number(salesAgg._sum.amount || 0),
            totalTransactions: salesAgg._count.id || 0,
            unitAverage: salesAgg._count.id > 0 ? Math.round(Number(salesAgg._sum.amount || 0) / salesAgg._count.id) : 0,
            activeOrders: activeOrdersCount,
            kitchenQueue: kitchenQueueCount,
            breakdown,
            logistics: {
                onRoad: onRoadCount,
                activeShifts: activeShiftsCount,
                deliveredToday: deliveredTodayCount
            }
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


// ==========================================
// 📜 4. MENU & CATEGORIES
// ==========================================

app.get('/api/menu_items', authMiddleware, async (req, res) => {
    const restaurant_id = req.restaurantId;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });
    try {
        const items = await prisma.menu_items.findMany({
            where: { restaurant_id },
            include: { menu_categories: true, menu_item_variants: true },
            orderBy: { name: 'asc' }
        });
        
        // Map menu_item_variants to variant for frontend alignment
        // Also expose `available` alias so the PWA can filter without knowing `is_available`
        const mappedItems = items.map((item: any) => {
            const { menu_item_variants, ...rest } = item;
            return {
                ...rest,
                available: item.is_available,  // PWA-compatible alias
                variant: menu_item_variants.map((v: any) => ({
                    id: v.id,
                    name: v.name,
                    name_urdu: v.name_urdu ?? null,
                    price: Number(v.price)
                }))
            };
        });

        res.json(mappedItems);
    } catch (e: any) {
        console.error('GET /api/menu_items ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/menu_items', authMiddleware, async (req, res) => {
    try {
        const { category_id, station_id, prep_time_minutes, ...data } = req.body;
        const createData: any = { ...data, restaurant_id: req.restaurantId };
        if (category_id) {
            createData.menu_categories = { connect: { id: category_id } };
        }
        if (station_id) {
            createData.stations = { connect: { id: station_id } };
            const stationRow = await prisma.stations.findUnique({ where: { id: station_id } });
            if (stationRow) createData.station = stationRow.name;
        }

        const item = await prisma.menu_items.create({ data: createData });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'menu_items', eventType: 'INSERT', data: item });
        if (item.restaurant_id) syncMenuToCloud(item.restaurant_id).catch(console.error);
        res.json(item);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/menu_items', authMiddleware, async (req, res) => {
    const { id, category_id, station_id, prep_time_minutes, ...data } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    try {
        const existing = await prisma.menu_items.findUnique({ where: { id } });
        if (!existing || existing.restaurant_id !== req.restaurantId) {
            return res.status(403).json({ error: 'Unauthorized to modify this menu item' });
        }

        const updateData: any = { ...data };
        
        if (category_id) {
            updateData.menu_categories = { connect: { id: category_id } };
        } else if (category_id === null || category_id === '') {
            updateData.menu_categories = { disconnect: true };
        }

        if (station_id) {
            updateData.stations = { connect: { id: station_id } };
            const stationRow = await prisma.stations.findUnique({ where: { id: station_id } });
            if (stationRow) updateData.station = stationRow.name;
        } else if (station_id === null || station_id === '') {
            updateData.stations = { disconnect: true };
            updateData.station = null;
        }

        const item = await prisma.menu_items.update({
            where: { id }, 
            data: updateData
        });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'menu_items', eventType: 'UPDATE', data: item });
        if (item.restaurant_id) syncMenuToCloud(item.restaurant_id).catch(console.error);
        res.json(item);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/menu_items', authMiddleware, async (req, res) => {
    const { id } = req.query;
    try {
        const item = await prisma.menu_items.findUnique({
            where: { id: String(id) },
            select: { restaurant_id: true }
        });
        if (item && item.restaurant_id !== req.restaurantId) {
            return res.status(403).json({ error: 'Unauthorized to delete this menu item' });
        }
        await prisma.menu_items.delete({ where: { id: String(id) } });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'menu_items', eventType: 'DELETE', id });
        if (item?.restaurant_id) syncMenuToCloud(item.restaurant_id).catch(console.error);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Categories
app.get('/api/menu_categories', async (req, res) => {
    const { restaurant_id, format } = req.query;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });
    try {
        const cats = await prisma.menu_categories.findMany({
            where: { restaurant_id: String(restaurant_id) },
            orderBy: { priority: 'asc' }
        });
        if (format === 'names') {
            return res.json(cats.map(c => c.name));
        }
        res.json(cats);
    } catch (e: any) {
        console.error('GET /api/menu_categories ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/menu_categories', authMiddleware, async (req, res) => {
    try {
        const cat = await prisma.menu_categories.create({ 
            data: { ...req.body, restaurant_id: req.restaurantId } 
        });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'menu_categories', eventType: 'INSERT', data: cat });
        syncMenuToCloud(cat.restaurant_id).catch(console.error);
        res.json(cat);
    } catch (e: any) {
        console.error('POST /api/menu_categories ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/menu_categories', authMiddleware, async (req, res) => {
    const { id, ...data } = req.body;
    try {
        const cat = await prisma.menu_categories.update({ 
            where: { id: String(id) }, 
            data: { ...data, restaurant_id: req.restaurantId } 
        });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'menu_categories', eventType: 'UPDATE', data: cat });
        syncMenuToCloud(cat.restaurant_id).catch(console.error);
        res.json(cat);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/menu_categories', authMiddleware, async (req, res) => {
    const { id } = req.query;
    try {
        await prisma.menu_categories.delete({ where: { id: String(id) } });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'menu_categories', eventType: 'DELETE', id });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 🝗︝ 5. SECTIONS & TABLES
// ==========================================

// 🚨 SECURITY: RESTRICTED API ROUTES
// Individual routes implemented for security and relational includes

app.get('/api/orders', authMiddleware, async (req, res) => {
    const restaurant_id = req.restaurantId;
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const orders = await prisma.orders.findMany({
            where: {
                restaurant_id,
                OR: [
                    { status: { notIn: ['CLOSED', 'CANCELLED', 'VOIDED', 'DELIVERED'] as any[] } },
                    { status: 'DELIVERED', created_at: { gte: sevenDaysAgo } },
                    { status: { in: ['CLOSED', 'CANCELLED', 'VOIDED'] as any[] }, created_at: { gte: twentyFourHoursAgo } }
                ]
            },
            include: {
                order_items: true,
                delivery_orders: true,
                takeaway_orders: true,
                dine_in_orders: true
            },
            orderBy: { created_at: 'desc' },
            take: 500
        });
        res.json(orders);
    } catch (e: any) {
        console.error('GET /api/orders ERROR:', e.message, e.code, e.meta);
        res.status(500).json({ error: e.message || 'Failed to fetch orders', code: e.code });
    }
});

app.get('/api/tables', authMiddleware, async (req, res) => {
    const restaurant_id = req.restaurantId;
    try {
        const tables = await prisma.tables.findMany({
            where: { restaurant_id },
            orderBy: { name: 'asc' }
        });
        res.json(tables);
    } catch (e: any) {
        console.error('GET /api/tables ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/sections', authMiddleware, async (req, res) => {
    const restaurant_id = req.restaurantId;
    try {
        const sections = await prisma.sections.findMany({
            where: { restaurant_id },
            orderBy: { priority: 'asc' }
        });
        res.json(sections);
    } catch (e: any) {
        console.error('GET /api/sections ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/staff', authMiddleware, async (req, res) => {
    const restaurant_id = req.restaurantId;
    try {
        const staff = await prisma.staff.findMany({
            where: {
                restaurant_id: restaurant_id,
                status: 'active'
            },
            include: {
                rider_shifts: {
                    where: { status: 'OPEN' },
                    take: 1
                }
            },
            orderBy: { name: 'asc' }
        });

        const sanitizedStaff = staff.map(s => {
            const { pin, hashed_pin, ...rest } = s;
            return {
                ...rest,
                active_shift: (s as any).rider_shifts?.[0] || null
            };
        });
        res.json(sanitizedStaff);
    } catch (e: any) {
        console.error('GET /api/staff ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/transactions', authMiddleware, async (req, res) => {
    const restaurant_id = req.restaurantId;
    try {
        const transactions = await prisma.transactions.findMany({
            where: { restaurant_id },
            orderBy: { created_at: 'desc' }
        });
        res.json(transactions);
    } catch (e: any) {
        console.error('GET /api/transactions ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/customers', authMiddleware, async (req, res) => {
    const restaurant_id = req.restaurantId;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });
    try {
        const customers = await accounting.getCustomerIntelligence(String(restaurant_id));
        res.json(customers);
    } catch (e: any) {
        console.error('GET /api/customers ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/vendors', authMiddleware, async (req, res) => {
    const restaurant_id = req.restaurantId;
    try {
        const vendors = await prisma.vendors.findMany({
            where: { restaurant_id },
            orderBy: { name: 'asc' }
        });
        res.json(vendors);
    } catch (e: any) {
        console.error('GET /api/vendors ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

// Sections
app.post('/api/sections', authMiddleware, async (req, res) => {
    try {
        const restaurant_id = req.restaurantId;
        if (!restaurant_id) return res.status(400).json({ error: 'Missing restaurant_id' });
        const section = await createSection(restaurant_id, req.body, io);
        res.json(section);
    } catch (e: any) {
        console.error('POST /api/sections ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/sections', authMiddleware, async (req, res) => {
    const { id, ...data } = req.body;
    const restaurant_id = req.restaurantId;
    if (!id || !restaurant_id) return res.status(400).json({ error: 'Missing id or restaurant_id' });
    try {
        const section = await updateSection(id, restaurant_id, data, io);
        res.json(section);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sections/reorder', authMiddleware, async (req, res) => {
    const { reordered_ids } = req.body;
    const restaurant_id = req.restaurantId;
    if (!restaurant_id || !Array.isArray(reordered_ids)) {
        return res.status(400).json({ error: 'Missing restaurant_id or reordered_ids array' });
    }
    try {
        await reorderSections(restaurant_id, reordered_ids, io);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/sections', authMiddleware, async (req, res) => {
    const { id } = req.query;
    const restaurant_id = req.restaurantId;
    try {
        await deleteSection(String(id), String(restaurant_id), io);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Tables
app.post('/api/tables', authMiddleware, async (req, res) => {
    try {
        const restaurant_id = req.restaurantId;
        if (!restaurant_id) return res.status(400).json({ error: 'Missing restaurant_id' });
        const table = await createTable(restaurant_id, req.body, io);
        res.json(table);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/tables', authMiddleware, async (req, res) => {
    const { id, ...data } = req.body;
    const restaurant_id = req.restaurantId;
    if (!id || !restaurant_id) return res.status(400).json({ error: 'Missing id or restaurant_id' });
    try {
        const table = await updateTable(id, restaurant_id, data, io);
        res.json(table);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/tables', authMiddleware, async (req, res) => {
    const { id } = req.query;
    const restaurant_id = req.restaurantId;
    try {
        await deleteTable(String(id), String(restaurant_id), io);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Floor Layout
app.get('/api/floor/layout/:restaurantId', async (req, res) => {
    const { restaurantId } = req.params;
    try {
        const layout = await getFloorLayout(restaurantId);
        res.json(layout);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 🧑”🤝”🧑 6. CUSTOMERS & VENDORS
// ==========================================

// Customers
app.post('/api/customers', authMiddleware, async (req, res) => {
    try {
        const { id, ...data } = req.body;
        const customer = await prisma.customers.create({
            data: {
                ...data,
                restaurant_id: req.restaurantId
            }
        });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'customers', eventType: 'INSERT', data: customer });
        res.json(customer);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/customers', async (req, res) => {
    const { id, ...data } = req.body;
    try {
        const customer = await prisma.customers.update({ where: { id }, data });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'customers', eventType: 'UPDATE', data: customer });
        res.json(customer);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Vendors
app.post('/api/vendors', authMiddleware, async (req, res) => {
    try {
        const { id, ...data } = req.body;
        const vendor = await prisma.vendors.create({
            data: {
                ...data,
                restaurant_id: req.restaurantId
            }
        });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'vendors', eventType: 'INSERT', data: vendor });
        res.json(vendor);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/vendors', async (req, res) => {
    const { id, ...data } = req.body;
    try {
        const vendor = await prisma.vendors.update({ where: { id }, data });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'vendors', eventType: 'UPDATE', data: vendor });
        res.json(vendor);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Stations
app.get('/api/stations', authMiddleware, async (req, res) => {
    const restaurant_id = req.restaurantId;
    try {
        const stations = await prisma.stations.findMany({
            where: { restaurant_id },
            orderBy: { name: 'asc' }
        });
        res.json(stations);
    } catch (e: any) {
        console.error('GET /api/stations ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/stations', authMiddleware, async (req, res) => {
    try {
        const station = await prisma.stations.create({ 
            data: { ...req.body, restaurant_id: req.restaurantId } 
        });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'stations', eventType: 'INSERT', data: station });
        res.json(station);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/stations', authMiddleware, async (req, res) => {
    const { id, ...data } = req.body;
    try {
        const station = await prisma.stations.update({ where: { id }, data: { ...data, restaurant_id: req.restaurantId } });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'stations', eventType: 'UPDATE', data: station });
        res.json(station);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/stations', authMiddleware, async (req, res) => {
    const { id } = req.query;
    try {
        await prisma.stations.delete({ where: { id: String(id) } });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'stations', eventType: 'DELETE', id });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


// ==========================================
// 📦 6. SYSTEM UTILITIES
// ==========================================

app.post('/api/system/seed-restaurant', authMiddleware, requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    const restaurantId = req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurant ID required' });

    try {
        const existingMainHall = await prisma.sections.findFirst({
            where: {
                restaurant_id: restaurantId,
                name: 'Main Hall'
            }
        });

        if (existingMainHall) {
            console.log(`✅ Restaurant ${restaurantId} already seeded - skipping (safe idempotent)`);
            return res.json({
                success: true,
                message: "Restaurant already seeded (skipped duplicate)",
                alreadySeeded: true
            });
        }

        const mainHall = await prisma.sections.upsert({
            where: {
                restaurant_id_name: {
                    restaurant_id: restaurantId,
                    name: 'Main Hall'
                }
            },
            update: {},
            create: {
                restaurant_id: restaurantId,
                name: 'Main Hall',
                type: 'DINING',
                priority: 1,
                prefix: 'T'
            }
        });

        // 3. Tables - check existence by name + restaurant (upsert prevents duplicates)
        const tableNames = [
            { name: 'T-1', capacity: 4 },
            { name: 'T-2', capacity: 2 },
            { name: 'T-3', capacity: 6 }
        ];

        for (const table of tableNames) {
            await prisma.tables.upsert({
                where: {
                    restaurant_id_name: {
                        restaurant_id: restaurantId,
                        name: table.name
                    }
                },
                update: {}, // nothing to update if exists
                create: {
                    restaurant_id: restaurantId,
                    section_id: mainHall.id,
                    name: table.name,
                    capacity: table.capacity,
                    status: 'AVAILABLE'
                }
            });
        }

        // 4. Menu Categories (upsert pattern prevents duplicates)
        const catStarters = await prisma.menu_categories.upsert({
            where: {
                restaurant_id_name: {
                    restaurant_id: restaurantId,
                    name: 'Starters'
                }
            },
            update: {}, // nothing to update if exists
            create: {
                restaurant_id: restaurantId,
                name: 'Starters',
                priority: 1
            }
        });

        const catMains = await prisma.menu_categories.upsert({
            where: {
                restaurant_id_name: {
                    restaurant_id: restaurantId,
                    name: 'Mains'
                }
            },
            update: {}, // nothing to update if exists
            create: {
                restaurant_id: restaurantId,
                name: 'Mains',
                priority: 2
            }
        });

        // 5. Menu Items (upsert allows safe re-runs with optional price updates)
        const menuItems = [
            {
                name: 'Chicken Wings',
                name_urdu: 'چکن ونگز',
                category: catStarters,
                price: 450,
                station: 'KITCHEN',
                image_url: 'https://images.unsplash.com/photo-1567620905732-2d1ec7bb7445?auto=format&fit=crop&w=400&q=80'
            },
            {
                name: 'Beef Burger',
                name_urdu: 'بیٝ برگر',
                category: catMains,
                price: 850,
                station: 'KITCHEN',
                image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80'
            },
            {
                name: 'Soda',
                name_urdu: 'سوڈا',
                category: catMains,
                price: 100,
                station: 'BAR',
                image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80'
            }
        ];

        for (const item of menuItems) {
            // Note: menu_items needs a unique constraint on (restaurant_id, name) for upsert to work
            // For now, using findFirst + create fallback
            const exists = await prisma.menu_items.findFirst({
                where: {
                    restaurant_id: restaurantId,
                    name: item.name
                }
            });

            if (!exists) {
                await prisma.menu_items.create({
                    data: {
                        restaurant_id: restaurantId,
                        category_id: item.category.id,
                        category: item.category.name,
                        name: item.name,
                        name_urdu: item.name_urdu,
                        price: item.price,
                        station: item.station,
                        image_url: item.image_url
                    }
                });
            }
        }

        // 6. Create seed admin staff if not exists (Admin Manager)
        const adminExists = await prisma.staff.findFirst({
            where: {
                restaurant_id: restaurantId,
                name: 'Admin Manager',
                role: 'ADMIN'
            }
        });

        if (!adminExists) {
            await prisma.staff.create({
                data: {
                    restaurant_id: restaurantId,
                    name: 'Admin Manager',
                    role: 'ADMIN',
                    pin: '0000',
                    status: 'active'
                }
            });
        }

        console.log(`✅ Seeded restaurant ${restaurantId} successfully (idempotent - safe to run multiple times)`);
        res.json({
            success: true,
            message: "Restaurant seeded successfully (idempotent)",
            alreadySeeded: false
        });

    } catch (e: any) {
        console.error("Seed Failed:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/system/reset-environment', authMiddleware, requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
    const restaurant_id = req.restaurantId;
    if (!restaurant_id) return res.status(400).json({ error: 'Restaurant ID required' });

    console.log(`🧹 RESET REQUEST FOR RESTAURANT: ${restaurant_id}`);

    try {
        await prisma.$transaction([
            prisma.order_items.deleteMany({ where: { orders: { restaurant_id } } }),
            prisma.transactions.deleteMany({ where: { restaurant_id } }),
            prisma.dine_in_orders.deleteMany({ where: { orders: { restaurant_id } } }),
            prisma.takeaway_orders.deleteMany({ where: { orders: { restaurant_id } } }),
            prisma.delivery_orders.deleteMany({ where: { orders: { restaurant_id } } }),
            prisma.reservation_orders.deleteMany({ where: { orders: { restaurant_id } } }),
            prisma.order_intelligence.deleteMany({ where: { orders: { restaurant_id } } }),
            prisma.orders.deleteMany({ where: { restaurant_id } }),
            prisma.tables.updateMany({
                where: { restaurant_id },
                data: { status: 'AVAILABLE', active_order_id: null, merge_id: null }
            })
        ]);

        console.log('✅ RESET COMPLETE');

        // Broadcast to all clients
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'orders', eventType: 'DELETE', id: 'ALL' });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'tables', eventType: 'UPDATE', id: 'ALL' });
        io.to(`restaurant:${req.restaurantId}`).emit('db_change', { table: 'transactions', eventType: 'DELETE', id: 'ALL' });

        res.json({ success: true, message: "Environment reset successfully. Database is now clean." });
    } catch (e: any) {
        console.error("Reset Failed:", e);
        res.status(500).json({ error: e.message });
    }
});
// (Moved higher up)

/**
 * GET /api/orders/qr-pending
 * Returns the list of QR orders awaiting cashier approval from DB.
 * NOTE: must stay registered ABOVE GET /api/orders/:id or the :id route shadows it.
 */
app.get('/api/orders/qr-pending', authMiddleware, async (req, res) => {
    try {
        const restaurantId = req.restaurantId;
        const pendingList = await prisma.orders.findMany({
            where: { restaurant_id: restaurantId, type: 'QR', status: 'PENDING_APPROVAL' },
            include: { order_items: true, tables: true },
            orderBy: { created_at: 'asc' }
        });

        // Map to the shape expected by the frontend (IncomingQROrder roughly)
        const mappedList = pendingList.map(order => ({
            id: order.id,
            restaurant_id: order.restaurant_id,
            table_number: order.tables?.name ? Number(order.tables.name) : undefined,
            table_label: order.tables?.name || null,
            items: order.order_items.map(item => ({
                menu_item_id: item.menu_item_id,
                name: item.item_name || 'Unknown',
                quantity: item.quantity,
                unit_price: Number(item.unit_price)
            })),
            subtotal: Number(order.total),
            notes: (order as any).notes,
            customer_name: order.customer_name,
            submitted_at: order.created_at.toISOString(),
            sig_verified: true
        }));

        res.json({ count: mappedList.length, orders: mappedList });
    } catch (e: any) {
        console.error('GET /api/orders/qr-pending error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Route to fetch specific order with all its relational extensions
app.get('/api/orders/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const restaurantId = req.restaurantId!;
        if (['all', 'summary', 'upsert', 'fire', 'qr-status', 'qr-pending', 'qr-approve', 'qr-reject', 'qr'].includes(id)) return res.status(404).json({ error: 'Order not found' });

        const order = await prisma.orders.findFirst({
            where: { id, restaurant_id: restaurantId },
            include: {
                order_items: true,
                dine_in_orders: true,
                takeaway_orders: true,
                delivery_orders: true,
                reservation_orders: true
            }
        });
        if (!order) {
            const byNumber = await prisma.orders.findFirst({
                where: { order_number: id, restaurant_id: restaurantId },
                include: {
                    order_items: true,
                    dine_in_orders: true,
                    takeaway_orders: true,
                    delivery_orders: true,
                    reservation_orders: true
                }
            });
            if (byNumber) return res.json(byNumber);
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json(order);
    } catch (e: any) {
        console.error(`GET /api/orders/${req.params.id} ERROR:`, e);
        res.status(500).json({ error: e.message });
    }
});

// NOTE: The canonical POST /api/orders/:id/settle route is defined above (with authMiddleware + sessionGateMiddleware).
// The stale duplicate that existed here has been removed to prevent security regressions.

// ==========================================
// 🔝 DEVICE PAIRING ENDPOINTS (SECURE)
// ==========================================

// ==========================================
// RATE LIMITERS
// ==========================================

// Rate limiters
const pairingGenerateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 5, // 5 requests per minute per IP
    message: 'Too many pairing code requests, please wait before generating another',
    standardHeaders: true,
    legacyHeaders: false,
});

const pairingVerifyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10, // 10 attempts per minute
    message: 'Too many pairing attempts, please wait',
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * POST /api/pairing/generate
 * Generate a new pairing code for device registration
 * 
 * Auth: Required (must be logged-in staff)
 * Rate limit: 5/min per IP
 */
app.post('/api/pairing/generate', authMiddleware, pairingGenerateLimiter, async (req, res) => {
    // Note: req.staffId and req.restaurantId are populated by authMiddleware
    const staffId = req.staffId;
    const restaurantId = req.restaurantId;

    // Input validation
    if (!restaurantId || !staffId) {
        return res.status(400).json({ error: 'Missing restaurantId or staffId' });
    }

    try {
        // Verify staff exists and belongs to restaurant
        const staff = await prisma.staff.findUnique({
            where: { id: staffId },
            select: { restaurant_id: true, status: true }
        });

        if (!staff || staff.restaurant_id !== restaurantId || staff.status !== 'active') {
            return res.status(403).json({ error: 'Unauthorized to generate pairing codes' });
        }

        // Generate pairing code
        const { code, expiresAt, id } = await generatePairingCode(
            restaurantId,
            staffId,        // generatedByStaffId (the manager generating the code)
            staffId,        // targetStaffId (same staff in this context)
            24              // durationHours (24 hour default)
        );

        res.json({
            success: true,
            pairing_code: code,
            code_id: id,
            expires_at: expiresAt,
            expires_in_minutes: 15,
            message: 'Pairing code generated. Valid for 15 minutes.'
        });
    } catch (error: any) {
        console.error('[ERROR] /api/pairing/generate:', error.message);
        res.status(500).json({ error: 'Failed to generate pairing code' });
    }
});

/**
 * POST /api/pairing/verify
 * Verify pairing code and register device
 * 
 * Auth: NOT required (device doesn't have token yet)
 * Rate limit: 10/min per IP
 * 
 * Body:
 * - restaurantId: UUID
 * - codeId: UUID (from generate response)
 * - code: String (6-char code user entered)
 * - deviceFingerprint: String (hash of userAgent + screen + timezone)
 * - deviceName: String (user-friendly name)
 * - userAgent: String
 * - platform: String (ios|android|linux|darwin|win32)
 */
app.post('/api/pairing/verify', pairingVerifyLimiter, async (req, res) => {
    const {
        restaurantId,
        codeId,
        code,
        deviceFingerprint,
        deviceName,
        userAgent,
        platform
    } = req.body;

    // Input validation (restaurantId and codeId are optional now since we can look them up via the 6-character code)
    if (!code || !deviceFingerprint || !deviceName || !platform) {
        return res.status(400).json({ error: 'Missing required pairing fields' });
    }

    // Validate code format (should be 6 chars)
    if (!/^[A-Z0-9]{6}$/.test(code)) {
        return res.status(400).json({ error: 'Invalid code format' });
    }

    try {
        let finalRestaurantId = restaurantId;
        let finalCodeId = codeId;

        // If client didn't provide restaurantId and codeId (e.g. manual entry or URL scan)
        if (!finalCodeId || !finalRestaurantId) {
            const activeCode = await prisma.pairing_codes.findFirst({
                where: {
                    pairing_code: code,
                    is_used: false,
                    expires_at: { gt: new Date() }
                }
            });

            if (!activeCode) {
                return res.status(404).json({ error: 'Pairing code not found, expired, or already used' });
            }

            finalCodeId = activeCode.id;
            finalRestaurantId = activeCode.restaurant_id;
        }

        // Verify the code we found (or the one passed directly if provided)
        const pairingCode = await prisma.pairing_codes.findFirst({
            where: {
                id: finalCodeId,
                restaurant_id: finalRestaurantId
            }
        });

        if (!pairingCode) {
            return res.status(404).json({ error: 'Pairing code not found' });
        }

        const { authToken, deviceId } = await verifyPairingCode(
            finalRestaurantId,
            finalCodeId,
            code,
            deviceFingerprint,
            deviceName,
            userAgent,
            platform
        );

        // Notify restaurant via Socket.IO: new device paired
        io.to(`restaurant:${finalRestaurantId}`).emit('device_change', {
            type: 'device_registered',
            device_id: deviceId,
            device_name: deviceName,
            platform: platform
        });

        res.json({
            success: true,
            device_id: deviceId,
            auth_token: authToken, // Send once to client, never store in DB
            message: 'Device paired successfully',
            next_steps: 'Save the auth_token securely on your device'
        });
    } catch (error: any) {
        const errorMap: Record<string, number> = {
            'INVALID_CODE': 401,
            'CODE_EXPIRED': 410,
            'CODE_ALREADY_USED': 409,
            'TOO_MANY_ATTEMPTS': 429
        };

        const statusCode = errorMap[error.message] || 500;
        console.error('[ERROR] /api/pairing/verify:', error.message);
        res.status(statusCode).json({ error: error.message || 'Pairing verification failed' });
    }
});

/**
 * GET /api/pairing/devices
 * List all paired devices for the current staff member
 * 
 * Auth: Required (via JWT or x-staff-id header)
 * TODO: After JWT implementation, validate token
 */
app.get('/api/pairing/devices', authMiddleware, async (req, res) => {
    const staffId = req.staffId;
    const restaurantId = req.restaurantId;

    if (!staffId || !restaurantId) {
        return res.status(400).json({ error: 'Missing staffId or restaurantId' });
    }

    try {
        const devices = await listPairedDevices(restaurantId as string, staffId as string);
        res.json({ success: true, devices });
    } catch (error: any) {
        console.error('[ERROR] /api/pairing/devices:', error.message);
        res.status(500).json({ error: 'Failed to fetch devices' });
    }
});

/**
 * DELETE /api/pairing/devices/:deviceId
 * Disable a paired device (revoke without deleting)
 * 
 * Auth: Required
 */
app.delete('/api/pairing/devices/:deviceId', authMiddleware, async (req, res) => {
    const { deviceId } = req.params;
    const staffId = req.staffId;
    const restaurantId = req.restaurantId;

    if (!staffId || !restaurantId) {
        return res.status(400).json({ error: 'Missing staffId or restaurantId' });
    }

    try {
        await disableDevice(deviceId, staffId as string, restaurantId as string);

        // Notify restaurant: device disabled
        io.to(`restaurant:${restaurantId}`).emit('device_change', {
            type: 'device_disabled',
            device_id: deviceId
        });

        res.json({ success: true, message: 'Device disabled' });
    } catch (error: any) {
        console.error('[ERROR] /api/pairing/devices DELETE:', error.message);
        res.status(error.message.includes('UNAUTHORIZED') ? 403 : 500).json({
            error: error.message || 'Failed to disable device'
        });
    }
});

// Cleanup job: Delete expired pairing codes every 5 minutes
setInterval(async () => {
    try {
        await cleanupExpiredCodes();
    } catch (error) {
        console.error('Pairing cleanup job failed:', error);
    }
}, 5 * 60 * 1000);

// --- Audit Log Routes ---
app.post('/api/audit-logs', authMiddleware, async (req, res) => {
    try {
        const { staff_id, action_type, entity_type, entity_id, details, ip_address } = req.body;

        const log = await prisma.audit_logs.create({
            data: {
                restaurant_id: req.restaurantId,
                staff_id,
                action_type,
                entity_type,
                entity_id,
                details: details ? (typeof details === 'string' ? JSON.parse(details) : details) : undefined,
                ip_address,
                created_at: new Date()
            }
        });

        res.json({ success: true, log });
    } catch (error: any) {
        console.error('Audit Log Creation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/audit-logs', authMiddleware, async (req, res) => {
    const restaurant_id = req.restaurantId;
    try {
        const { limit = '100', offset = '0' } = req.query;
        if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });

        const logs = await prisma.audit_logs.findMany({
            where: { restaurant_id },
            orderBy: { created_at: 'desc' },
            take: Number(limit),
            skip: Number(offset),
            include: {
                staff: {
                    select: {
                        id: true,
                        name: true,
                        role: true,
                        restaurant_id: true,
                        status: true
                    }
                }
            }
        });

        res.json({ success: true, logs });
    } catch (error: any) {
        console.error('Audit Log Fetch Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Payment Verification Endpoint (SaaS Admin) ---
/**
 * PATCH /api/saas/payments/:paymentId/verify
 * Admin endpoint to verify or reject subscription payments
 * Updates payment status and sends notification
 */
app.patch('/api/saas/payments/:paymentId/verify', authMiddleware, async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { status, notes } = req.body;

        if (!['verified', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Status must be "verified" or "rejected"' });
        }

        if (req.role !== 'SUPER_ADMIN' && req.role !== 'MANAGER') {
            return res.status(403).json({ error: 'Only admins can verify payments' });
        }

        const restaurantId = req.role === 'SUPER_ADMIN' ? (req.body.restaurant_id || req.restaurantId) : req.restaurantId;
        const restaurant = await prisma.restaurants.findUnique({
            where: { id: restaurantId },
            select: { name: true, phone: true, subscription_plan: true }
        });

        if (!restaurant) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        console.log(`[PAYMENT] Updating payment ${paymentId} to ${status}`);

        try {
            if (status === 'verified') {
                await sendPaymentVerified({
                    name: restaurant.name,
                    phone: restaurant.phone ?? '',
                    plan: restaurant.subscription_plan || 'STANDARD'
                });
            } else if (status === 'rejected') {
                await sendPaymentRejected({
                    name: restaurant.name,
                    phone: restaurant.phone ?? '',
                    reason: notes
                });
            }
        } catch (notifyErr) {
            console.warn('[NOTIFY] Could not send payment notification:', notifyErr);
        }

        res.json({
            success: true,
            message: `Payment ${status} and notification sent`
        });
    } catch (error: any) {
        console.error('[ERROR] /api/saas/payments/:paymentId/verify:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// GENERIC API ENDPOINTS (Fallback)
// ==========================================

const GENERIC_API_ALLOWED_TABLES = [
    'menu_items',
    'menu_categories',
    'tables',
    'sections',
    'stations'
] as const;

const GENERIC_API_SENSITIVE_TABLES = [
    'staff',
    'audit_logs',
    'security_events',
    'payments',
    'subscription_payments',
    'license_keys',
    'fbr_sync_logs'
] as const;

const GENERIC_API_SENSITIVE_FIELDS = [
    'pin', 'hashed_pin', 'password', 'secret', 'token', 'key',
    'service_role', 'api_key', 'private_key', 'secret_key'
] as const;

app.get('/api/:table', authMiddleware, async (req, res) => {
    const { table } = req.params;
    const { $limit, $order, ...filters } = req.query;

    if (GENERIC_API_SENSITIVE_TABLES.includes(table as any)) {
        return res.status(403).json({ error: `Table '${table}' is not accessible via generic API` });
    }

    if (!GENERIC_API_ALLOWED_TABLES.includes(table as any)) {
        return res.status(400).json({ error: `Table '${table}' not exposed via generic API` });
    }

    try {
        if (!((prisma as any)[table])) {
            return res.status(404).json({ error: `Table '${table}' not found in database schema` });
        }

        const where: any = { restaurant_id: req.restaurantId };

        Object.entries(filters).forEach(([key, value]) => {
            if (GENERIC_API_SENSITIVE_FIELDS.includes(key as any)) {
                return;
            }
            if (typeof value === 'string') {
                if (value.startsWith('neq.')) {
                    where[key] = { not: value.replace('neq.', '') };
                } else {
                    where[key] = value;
                }
            }
        });

        let orderBy: any = { created_at: 'desc' };
        if ($order && typeof $order === 'string') {
            const [field, direction] = $order.split('.');
            if (!GENERIC_API_SENSITIVE_FIELDS.includes(field as any)) {
                orderBy = { [field]: direction === 'desc' ? 'desc' : 'asc' };
            }
        }

        const data = await (prisma as any)[table].findMany({
            where,
            orderBy,
            take: $limit ? Math.min(Number($limit), 100) : 100
        });

        const sanitized = (data || []).map((row: any) => {
            const sanitizedRow: any = {};
            for (const [key, value] of Object.entries(row)) {
                if (!GENERIC_API_SENSITIVE_FIELDS.includes(key as any)) {
                    sanitizedRow[key] = value;
                }
            }
            return sanitizedRow;
        });

        res.json(sanitized);
    } catch (error: any) {
        res.status(500).json({ 
            error: error.message || `Failed to fetch ${table}`,
            code: error.code 
        });
    }
});

// Server Initialization
const PORT = 3001;

// Graceful error handler — catches EADDRINUSE and prints fix instructions
server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ PORT ${PORT} IS ALREADY IN USE\n`);
        console.error(`   Another server process is already running on port ${PORT}.`);
        console.error(`   Fix it with one of these commands:\n`);
        console.error(`   Option 1 — Kill & restart in one step:`);
        console.error(`     npm run server:fresh\n`);
        console.error(`   Option 2 — Kill only:`);
        console.error(`     npm run kill:3001\n`);
        console.error(`   Option 3 — Manual PowerShell kill:`);
        console.error(`     $p=(Get-NetTCPConnection -LocalPort ${PORT} -EA 0).OwningProcess; if($p){Stop-Process -Id $p -Force}\n`);
        process.exit(1);
    } else {
        throw err;
    }
});

server.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server Engine Online: http://localhost:${PORT}`);
    
    logger.log({
        level: LogLevel.INFO,
        service: 'startup',
        action: 'server_started',
        metadata: {
            port: PORT,
            environment: config.NODE_ENV,
            cloud_enabled: isCloudEnabled(),
            url: `http://localhost:${PORT}`
        }
    }, true);

    // Test database connection
    try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        const dbDuration = Date.now() - dbStart;
        console.log(`✅ Database connection verified (${dbDuration}ms)`);
        
        logger.log({
            level: LogLevel.INFO,
            service: 'startup',
            action: 'database_verified',
            duration_ms: dbDuration
        });
    } catch (error: any) {
        console.error(`❌ Database connection failed: ${error.message}`);
        
        logger.log({
            level: LogLevel.CRITICAL,
            service: 'startup',
            action: 'database_connection_failed',
            error: {
                message: error.message,
                code: error.code
            }
        });
    }


    outboxReader.start();
    integrationDispatcher.start();

    // QR Order Bridge (Async Background Sync)
    try {
        const firstRestaurant = await prisma.restaurants.findFirst({
            select: { id: true }
        });
        if (firstRestaurant) {
            qrOrderBridge.start(firstRestaurant.id);
            
            // Listen for incoming cloud orders
            qrOrderBridge.on('new_order', (localOrder) => {
                // Also register the order into AppContext state so UPDATE can merge on top of it
                io.to(`restaurant:${localOrder.restaurant_id}`).emit('db_change', {
                    table: 'orders',
                    eventType: 'INSERT',
                    data: localOrder
                });
                io.to(`restaurant:${localOrder.restaurant_id}`).emit('qr_new_order', {
                    id: localOrder.id,
                    restaurant_id: localOrder.restaurant_id,
                    table_number: localOrder.tables?.name ? Number(localOrder.tables.name) : undefined,
                    table_label: localOrder.tables?.name || null,
                    items: localOrder.order_items || localOrder.items,
                    subtotal: localOrder.total,
                    notes: localOrder.special_instructions || null,
                    customer_name: localOrder.customer_name,
                    submitted_at: localOrder.created_at,
                    sig_verified: true
                });
            });
            
            // Sync menu to cloud on startup
            syncMenuToCloud(firstRestaurant.id).catch(console.error);
        }
    } catch (bridgeErr: any) {
        console.warn('[QR BRIDGE] Could not auto-start bridge:', bridgeErr.message);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 🟡 QR SELF-ORDERING: CASHIER APPROVAL ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: GET /api/menu_items and GET /api/menu_categories are handled by the
// canonical routes above (lines ~1650, ~1753). Those routes now support both
// staff POS and PWA via the `available` alias and `?format=names` param.

/**
 * GET /api/orders/qr-status/:orderId
 * Tracks the live status of an order for the PWA
 */
app.get('/api/orders/qr-status/:orderId', async (req, res) => {
    try {
        const order = await prisma.orders.findUnique({
            where: { id: req.params.orderId },
            select: { status: true, cancellation_reason: true }
        });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        let message = '';
        if (order.status === 'PENDING_APPROVAL') message = 'Waiting for cashier approval...';
        else if (order.status === 'ACTIVE') message = 'Order approved! Kitchen is preparing...';
        else if (order.status === 'READY') message = 'Your order is ready! Please ask staff.';
        else if (order.status === 'CANCELLED') message = `Order cancelled: ${order.cancellation_reason || 'No reason provided'}`;
        else message = `Order status: ${order.status}`;
        
        res.json({ status: order.status, message });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/orders/qr
 * Public endpoint for the local PWA to submit QR orders directly
 */
app.post('/api/orders/qr', async (req, res) => {
    try {
        const { tableId, items, total, customerName } = req.body;
        
        if (!tableId || !items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'tableId and items array are required' });
        }

        const mappedItems = items.map((i: any) => ({
            menu_item_id: i.id,
            name: i.name,
            quantity: i.quantity,
            unit_price: i.price
        }));

        let orderData: any = {
            table_id: tableId,
            items: mappedItems,
            subtotal: total,
            customer_name: customerName
        };
        
        // Ensure restaurant_id is set.
        // PRIORITY: Use the RESTAURANT_ID from .env (written by FireFlow Activation)
        // This guarantees the order is saved under the same tenant the cashier is viewing.
        // Fallback to findFirst() only if the env variable is not set.
        const envRestaurantId = process.env.RESTAURANT_ID;
        let resolvedRestaurantId: string | null = envRestaurantId || null;

        if (!resolvedRestaurantId) {
            const firstRestaurant = await prisma.restaurants.findFirst({ select: { id: true } });
            resolvedRestaurantId = firstRestaurant?.id || null;
        }

        if (!resolvedRestaurantId) {
            return res.status(400).json({ error: 'No local restaurant configured' });
        }
        orderData.restaurant_id = resolvedRestaurantId;


        const localOrder = await qrOrderBridge.createLocalQROrder(orderData);

        // Register the order into AppContext state so the later approval UPDATE can merge correctly
        io.to(`restaurant:${orderData.restaurant_id}`).emit('db_change', {
            table: 'orders',
            eventType: 'INSERT',
            data: localOrder
        });

        // Also notify the QR approval queue panel specifically
        io.to(`restaurant:${orderData.restaurant_id}`).emit('qr_new_order', {
            id: localOrder.id,
            restaurant_id: localOrder.restaurant_id,
            table_number: localOrder.tables?.name ? Number(localOrder.tables.name) : undefined,
            table_label: localOrder.tables?.name || null,
            items: localOrder.order_items || localOrder.items,
            subtotal: localOrder.total,
            notes: localOrder.special_instructions || null,
            customer_name: localOrder.customer_name,
            submitted_at: localOrder.created_at,
            sig_verified: true
        });

        res.json({ success: true, orderId: localOrder.id, message: 'Order successfully created' });
    } catch (e: any) {
        console.error('[ERROR] POST /api/orders/qr:', e.message);
        res.status(500).json({ error: e.message || 'Failed to create local QR order' });
    }
});

/**
 * POST /api/orders/qr-approve
 * Cashier approves a pending QR order.
 * - If the table already has an active order, the items are MERGED into it.
 * - If not, the QR order is promoted to an ACTIVE DINE_IN order.
 * - Items are immediately set to PREPARING so they appear on the KDS.
 * Body: { qr_order_id: string, table_id?: string }
 */
app.post('/api/orders/qr-approve', authMiddleware, async (req, res) => {
    const { qr_order_id, table_id } = req.body;
    if (!qr_order_id) {
        return res.status(400).json({ error: 'qr_order_id is required' });
    }

    try {
        const restaurantId = req.restaurantId;
        const staffId = req.staffId;

        const pending = await prisma.orders.findUnique({
            where: { id: qr_order_id },
            include: { order_items: true, tables: true }
        });

        if (!pending || pending.status !== 'PENDING_APPROVAL' || pending.type !== 'QR') {
            return res.status(404).json({ error: 'QR order not found or already processed.' });
        }

        // 1. Resolve table_id using multiple strategies
        let resolvedTableId: string | null = table_id || pending.table_id;

        // Fallback: if still null, look up the original cloud order by ID and parse table_label
        if (!resolvedTableId) {
            try {
                const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
                const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
                if (supabaseUrl && supabaseKey) {
                    const { createClient } = await import('@supabase/supabase-js');
                    const sb = createClient(supabaseUrl, supabaseKey);
                    const { data: cloudOrder } = await sb
                        .from('qr_orders_queue')
                        .select('table_label')
                        .eq('id', qr_order_id)
                        .single();

                    if (cloudOrder?.table_label) {
                        // Strategy A: raw UUID
                        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                        if (uuidRegex.test(cloudOrder.table_label.trim())) {
                            resolvedTableId = cloudOrder.table_label.trim();
                        }
                        // Strategy B: legacy "Table ID: <uuid>"
                        if (!resolvedTableId) {
                            const match = cloudOrder.table_label.match(/Table ID:\s*([0-9a-f-]{36})/i);
                            if (match) resolvedTableId = match[1];
                        }
                        if (resolvedTableId) {
                            console.log(`[QR APPROVE] Resolved table_id from cloud label: ${resolvedTableId}`);
                        }
                    }
                }
            } catch (lookupErr: any) {
                console.warn('[QR APPROVE] Cloud table_label lookup failed:', lookupErr.message);
            }
        }

        // 2. Check if the table already has an active order (merge scenario)
        let existingActiveOrderId: string | null = null;
        if (resolvedTableId) {
            const tableRow = await prisma.tables.findUnique({ where: { id: resolvedTableId } });
            if (tableRow?.active_order_id) {
                const activeOrder = await prisma.orders.findUnique({ where: { id: tableRow.active_order_id } });
                if (activeOrder && activeOrder.status === 'ACTIVE') {
                    existingActiveOrderId = activeOrder.id;
                }
            }
        }

        let finalOrderId: string;
        let broadcastOrder: any;
        let tableUpdate: any = null;

        if (existingActiveOrderId) {
            // ── MERGE: append items into the existing active ticket ─────────
            console.log(`[QR APPROVE] 🔀 Merging QR order ${qr_order_id} into existing ticket ${existingActiveOrderId}`);

            const newItems = await Promise.all(
                pending.order_items.map(item =>
                    prisma.order_items.create({
                        data: {
                            order_id: existingActiveOrderId!,
                            menu_item_id: item.menu_item_id,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            total_price: item.total_price,
                            item_name: item.item_name,
                            item_status: 'PREPARING',   // ↝ straight to KDS
                            special_instructions: item.special_instructions || ''
                        }
                    })
                )
            );

            const existingOrder = await prisma.orders.findUnique({ where: { id: existingActiveOrderId } });
            const mergedTotal = Number(existingOrder?.total || 0) + Number(pending.total);

            broadcastOrder = await prisma.orders.update({
                where: { id: existingActiveOrderId },
                data: { total: mergedTotal, updated_at: new Date() },
                include: { order_items: true, tables: true }
            });

            // Remove the temporary pending QR order
            await prisma.order_items.deleteMany({ where: { order_id: qr_order_id } });
            await prisma.orders.delete({ where: { id: qr_order_id } });

            finalOrderId = existingActiveOrderId;

            // Push each new item to KDS immediately
            for (const item of newItems) {
                io.to(`restaurant:${restaurantId}`).emit('db_change', {
                    table: 'order_items',
                    eventType: 'INSERT',
                    data: item
                });
            }

        } else {
            // ── NEW TICKET: promote the QR order to ACTIVE ─────────────────

            // Flip all items to PREPARING so they appear on KDS
            await prisma.order_items.updateMany({
                where: { order_id: qr_order_id },
                data: { item_status: 'PREPARING' }
            });

            // Generate order_number matching the normal dine-in format
            const ts = new Date();
            const qrOrderNumber = `ORD-${ts.getHours()}${ts.getMinutes()}${ts.getSeconds()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

            finalOrderId = qr_order_id;

            // Create dine_in_orders record if needed (do this FIRST so we can include it in the broadcast payload)
            if (resolvedTableId) {
                const existingDineIn = await prisma.dine_in_orders.findUnique({ where: { order_id: finalOrderId } });
                if (!existingDineIn) {
                    await prisma.dine_in_orders.create({
                        data: {
                            order_id: finalOrderId,
                            table_id: resolvedTableId,
                            guest_count: pending.customer_name ? 1 : 1,
                            waiter_id: staffId,
                            seated_at: new Date()
                        }
                    });
                }
            }

            // Mark table OCCUPIED with this order
            if (resolvedTableId) {
                tableUpdate = await prisma.tables.update({
                    where: { id: resolvedTableId },
                    data: { status: 'OCCUPIED', active_order_id: finalOrderId }
                });
            }

            // NOW update the order and fetch it WITH the new dine_in_orders relation for the broadcast
            broadcastOrder = await prisma.orders.update({
                where: { id: qr_order_id },
                data: {
                    status: 'ACTIVE',
                    type: 'DINE_IN',
                    table_id: resolvedTableId,
                    assigned_waiter_id: staffId,
                    order_number: qrOrderNumber,
                    payment_status: 'UNPAID',
                    last_action_by: staffId,
                    last_action_desc: 'QR self-order approved by cashier',
                    updated_at: new Date()
                } as any,
                include: { order_items: true, tables: true, dine_in_orders: true }
            });

            // Push all items to KDS
            for (const item of broadcastOrder.order_items) {
                io.to(`restaurant:${restaurantId}`).emit('db_change', {
                    table: 'order_items',
                    eventType: 'INSERT',
                    data: item
                });
            }
        }

        // 3. Broadcast order update to all POS screens / floor plan
        io.to(`restaurant:${restaurantId}`).emit('db_change', {
            table: 'orders',
            eventType: 'UPDATE',
            data: broadcastOrder
        });

        if (tableUpdate) {
            io.to(`restaurant:${restaurantId}`).emit('db_change', {
                table: 'tables',
                eventType: 'UPDATE',
                data: tableUpdate
            });
        }

        // 4. Notify customer's phone screen
        io.to(`restaurant:${restaurantId}`).emit('qr_order_approved', {
            qr_order_id,
            local_order_id: finalOrderId,
            table_number: broadcastOrder.tables?.name
        });

        console.log(`[QR APPROVE] ✅ Order ${finalOrderId} approved by ${staffId} (${existingActiveOrderId ? 'merged into existing ticket' : 'new ticket created'})`);
        res.json({ success: true, order_id: finalOrderId, message: `QR order approved. Order #${finalOrderId.slice(-6).toUpperCase()} is now ACTIVE.` });

    } catch (e: any) {
        console.error('[ERROR] POST /api/orders/qr-approve:', e.message);
        res.status(500).json({ error: e.message || 'Failed to approve QR order' });
    }
});

/**
 * POST /api/orders/qr-reject
 * Cashier rejects a pending QR order.
 * Body: { qr_order_id: string, reason?: string }
 */
app.post('/api/orders/qr-reject', authMiddleware, async (req, res) => {
    const { qr_order_id, reason } = req.body;
    if (!qr_order_id) {
        return res.status(400).json({ error: 'qr_order_id is required' });
    }

    try {
        const restaurantId = req.restaurantId;
        const pending = await prisma.orders.findUnique({
            where: { id: qr_order_id },
            include: { tables: true }
        });

        if (!pending || pending.status !== 'PENDING_APPROVAL' || pending.type !== 'QR') {
            return res.status(404).json({ error: 'QR order not found or already processed.' });
        }

        // Mark as CANCELLED
        await prisma.orders.update({
            where: { id: qr_order_id },
            data: {
                status: 'CANCELLED',
                cancellation_reason: reason || 'Order was declined by cashier.',
                updated_at: new Date()
            }
        });

        // Broadcast rejection so cashier UI updates everywhere
        io.to(`restaurant:${restaurantId}`).emit('qr_order_rejected', {
            qr_order_id,
            table_number: pending.tables?.name || 'Unknown',
            reason: reason || 'Order was declined by cashier.'
        });

        console.log(`[QR REJECT] ❌ Order ${qr_order_id} rejected.`);
        res.json({ success: true, message: 'QR order rejected and marked as CANCELLED.' });
    } catch (e: any) {
        console.error('[ERROR] POST /api/orders/qr-reject:', e.message);
        res.status(500).json({ error: e.message || 'Failed to reject QR order' });
    }
});

