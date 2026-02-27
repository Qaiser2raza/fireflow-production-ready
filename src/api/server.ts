import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { logger, LogLevel, requestLoggerMiddleware } from '../shared/lib/logger';
import { config, isCloudEnabled } from '../config/env';
import { initializeSentry, setupGlobalErrorHandlers, captureException } from '../monitoring/errorTracking';
import HealthMonitor from '../monitoring/HealthMonitor';
import { setupSwagger } from './swagger';

import { OrderServiceFactory } from './services/orders/OrderServiceFactory';
import { AccountingService } from './services/AccountingService';
import deliveryRoutes from './routes/deliveryRoutes';
import accountingRoutes from './routes/accountingRoutes';
import customerRoutes from './routes/customerRoutes';
import reportRoutes from './routes/reportRoutes';
import { jwtService } from './services/auth/JwtService';
import { authMiddleware } from './middleware/authMiddleware';
import { startSubscriptionChecker } from './jobs/subscriptionChecker.js';
import { sendPaymentVerified, sendPaymentRejected } from './services/notificationService.js';

const accounting = new AccountingService();
import { superAdminService } from './services/SuperAdminService';
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
io.on('connection', (socket) => {
    console.log(`[SOCKET] User connected: ${socket.id}`);

    socket.on('join', (data: { room: string }) => {
        if (data.room) {
            socket.join(data.room);
            console.log(`[SOCKET] Socket ${socket.id} joined room: ${data.room}`);
        }
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

// Setup API Documentation
setupSwagger(app);

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
// 🔧 0. SETUP / FIRST-TIME ACTIVATION
// ==========================================

/**
 * GET /api/setup/status
 * Returns whether this machine is activated (has RESTAURANT_ID in env).
 * The React app calls this on startup to decide: show Activation or Login screen.
 */
app.get('/api/setup/status', async (_req, res) => {
    const restaurantId = process.env.RESTAURANT_ID;

    if (!restaurantId) {
        return res.json({ activated: false });
    }

    // Verify the local restaurant record actually exists
    try {
        const restaurant = await prisma.restaurants.findUnique({
            where: { id: restaurantId },
            select: { id: true, name: true, subscription_status: true, subscription_plan: true }
        });

        if (!restaurant) {
            // ID in env but no local record — partial setup, re-activate
            return res.json({ activated: false, reason: 'incomplete_setup' });
        }

        return res.json({
            activated: true,
            restaurant_id: restaurant.id,
            restaurant_name: restaurant.name,
            subscription_status: restaurant.subscription_status,
            subscription_plan: restaurant.subscription_plan,
        });
    } catch (err) {
        return res.json({ activated: false, reason: 'db_error' });
    }
});

/**
 * POST /api/setup/activate
 * The one-time cloud handshake. Called from ActivationView.
 *
 * Body: { licenseKey, restaurantName, ownerPhone, city }
 * 1. Validates the key against Supabase Cloud
 * 2. Registers the restaurant in Supabase (creates the cloud record)
 * 3. Creates the local restaurant row with the cloud-assigned restaurant_id
 * 4. Marks the license key as "active" in Supabase
 * 5. Writes RESTAURANT_ID and LICENSE_KEY into .env
 *
 * This endpoint is intentionally public (no auth) — it only runs once per machine.
 */
app.post('/api/setup/activate', async (req, res) => {
    const { licenseKey, restaurantName, ownerPhone, city } = req.body;

    if (!licenseKey || !restaurantName || !ownerPhone || !city) {
        return res.status(400).json({ error: 'All fields are required: licenseKey, restaurantName, ownerPhone, city' });
    }

    // Prevent re-activation if already set up
    if (process.env.RESTAURANT_ID) {
        return res.status(409).json({ error: 'This machine is already activated. Reset to re-activate.' });
    }

    try {
        // Step 1: Validate the license key against Supabase Cloud
        const { checkLicenseKey, registerRestaurant, activateLicenseKey } = await import('../shared/lib/cloudClient');

        const keyCheck = await checkLicenseKey(licenseKey.trim().toUpperCase());
        if (keyCheck.error || !keyCheck.data) {
            return res.status(400).json({ error: keyCheck.error || 'Invalid or already used license key' });
        }

        const plan = keyCheck.data.plan;

        // Step 2: Generate a deterministic restaurant_id (UUID v4 via crypto)
        const { randomUUID } = await import('crypto');
        const restaurantId = randomUUID();

        // Step 3: Register restaurant in Supabase Cloud (creates trial record)
        const slug = `${restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${restaurantId.substring(0, 6)}`;
        const cloudReg = await registerRestaurant({
            restaurantId,
            name: restaurantName.trim(),
            phone: ownerPhone.trim(),
            city: city.trim(),
            slug,
            subscriptionPlan: plan,
        });

        if (cloudReg.error || !cloudReg.data) {
            return res.status(500).json({ error: cloudReg.error || 'Failed to register in cloud. Please check your internet connection.' });
        }

        // Step 4: Create the local restaurant record with the SAME restaurant_id
        await prisma.restaurants.create({
            data: {
                id: restaurantId,
                name: restaurantName.trim(),
                slug,
                phone: ownerPhone.trim(),
                address: city.trim(),
                subscription_plan: plan,
                subscription_status: 'trial',
                trial_ends_at: new Date(cloudReg.data.trial_ends_at),
                created_at: new Date(),
                updated_at: new Date(),
            }
        });

        // Step 5: Activate the license key in Supabase (marks it as used)
        await activateLicenseKey(licenseKey.trim().toUpperCase(), restaurantId);

        // Step 6: Write identity to .env file (persists across server restarts)
        const fs = await import('fs');
        const path = await import('path');
        const envPath = path.resolve(process.cwd(), '.env');
        let envContent = '';
        try {
            envContent = fs.readFileSync(envPath, 'utf8');
        } catch {
            // .env didn't exist; will create it
        }

        // Remove any existing RESTAURANT_ID or LICENSE_KEY lines then append
        const filtered = envContent
            .split('\n')
            .filter(line => !line.startsWith('RESTAURANT_ID=') && !line.startsWith('LICENSE_KEY='))
            .join('\n');

        const newContent = `${filtered.trim()}\n\n# Written by FireFlow Activation\nRESTAURANT_ID=${restaurantId}\nLICENSE_KEY=${licenseKey.trim().toUpperCase()}\n`;
        fs.writeFileSync(envPath, newContent, 'utf8');

        // Step 7: Update process.env in memory so it takes effect immediately (no restart needed)
        process.env.RESTAURANT_ID = restaurantId;
        process.env.LICENSE_KEY = licenseKey.trim().toUpperCase();

        console.log(`[SETUP] ✅ Activation complete. Restaurant "${restaurantName}" registered with ID: ${restaurantId}`);

        return res.json({
            success: true,
            restaurant_id: restaurantId,
            plan: plan,
            trial_ends_at: cloudReg.data.trial_ends_at,
            restaurant_name: restaurantName.trim(),
        });

    } catch (err: any) {
        console.error('[SETUP] Activation error:', err.message);
        return res.status(500).json({ error: 'Activation failed: ' + err.message });
    }
});

/**
 * POST /api/setup/create-manager
 * Creates the first MANAGER staff account after activation.
 * Only works if there are no existing staff for this restaurant.
 */
app.post('/api/setup/create-manager', async (req, res) => {
    const { name, pin, restaurantId } = req.body;

    if (!name || !pin || !restaurantId) {
        return res.status(400).json({ error: 'name, pin, and restaurantId are required' });
    }

    if (!/^\d{4,6}$/.test(pin)) {
        return res.status(400).json({ error: 'PIN must be 4-6 digits' });
    }

    try {
        // Safety guard: don't allow if staff already exist for this restaurant
        const existingStaff = await prisma.staff.count({
            where: { restaurant_id: restaurantId }
        });

        if (existingStaff > 0) {
            return res.status(409).json({ error: 'Staff already exist for this restaurant. Use Settings to add more staff.' });
        }

        const manager = await prisma.staff.create({
            data: {
                restaurant_id: restaurantId,
                name: name.trim(),
                role: 'MANAGER',
                pin: pin,
                status: 'ACTIVE',
            }
        });

        console.log(`[SETUP] ✅ First manager created: ${manager.name} for restaurant ${restaurantId}`);

        return res.json({ success: true, staff_id: manager.id, name: manager.name, role: manager.role });
    } catch (err: any) {
        console.error('[SETUP] create-manager error:', err.message);
        return res.status(500).json({ error: 'Failed to create manager: ' + err.message });
    }
});

// ==========================================
// 🛡️ 1. AUTHENTICATION (SPECIFIC)
// ==========================================

/**
 * POST /api/auth/login
 * PIN-based authentication with JWT token generation
 * 
 * Request: { pin: "1234", restaurant_id?: "uuid" }
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
app.post('/api/auth/login', async (req, res) => {
    const { pin } = req.body;
    const startTime = Date.now();

    // Input validation: PIN must be 4-6 digits
    if (!pin || typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
        logger.log({
            level: LogLevel.WARN,
            service: 'auth',
            action: 'login_invalid_pin_format',
            metadata: { pin_format: typeof pin }
        });
        return res.status(400).json({ error: 'PIN must be 4-6 digits' });
    }

    try {
        // Find active staff by PIN
        // For PIN-only login, the PIN acts as the primary identifier.
        // We look for any active staff matching this PIN (plaintext lookup).
        let user = await prisma.staff.findFirst({
            where: {
                pin: pin,
                restaurant_id: req.body.restaurant_id || undefined
            }
        });

        // If not found by plaintext PIN, and we have hashed pins, we might need to 
        // iterate or have another identifier. For now, since PINs are small, 
        // we'll stick to plaintext identifier or a broader search if required.
        // POS systems typically use unique PINs as identifiers.

        if (!user) {
            // Generic error to avoid user enumeration
            logger.log({
                level: LogLevel.WARN,
                service: 'auth',
                action: 'login_invalid_credentials',
                metadata: { pin_length: pin.length }
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Fetch specialized restaurant details for branding
        const restaurant = await prisma.restaurants.findUnique({
            where: { id: user.restaurant_id },
            select: { id: true, name: true, slug: true, logo_url: true as any }
        });


        // Update last login timestamp
        const updatedUser = await prisma.staff.update({
            where: { id: user.id },
            data: { last_login: new Date() }
        });

        // Generate JWT tokens
        const accessToken = jwtService.generateAccessToken(
            user.id,
            user.restaurant_id,
            user.role,
            user.name
        );

        const refreshToken = jwtService.generateRefreshToken(
            user.id,
            user.restaurant_id,
            user.role,
            user.name
        );

        // Audit log: Record successful authentication
        await prisma.audit_logs.create({
            data: {
                restaurant_id: user.restaurant_id,
                staff_id: user.id,
                action_type: 'STAFF_LOGIN',
                entity_type: 'STAFF',
                entity_id: user.id,
                details: {
                    method: user.hashed_pin ? 'bcrypt' : 'plaintext_fallback',
                    timestamp: new Date().toISOString()
                }
            }
        });

        // Log successful authentication
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

        // Return sanitized user object (never expose PIN/hash to client)
        const sanitizedUser = {
            id: updatedUser.id,
            name: updatedUser.name,
            role: updatedUser.role,
            restaurant_id: updatedUser.restaurant_id,
            status: updatedUser.status,
            last_login: updatedUser.last_login
        };

        res.json({
            success: true,
            staff: sanitizedUser,
            restaurant: restaurant,
            tokens: {
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: 15 * 60  // 15 minutes in seconds
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
 * Create a new restaurant record
 */
app.post('/api/restaurants', async (req, res) => {
    try {
        const { name, slug, phone, address, city, subscription_plan, subscription_status } = req.body;

        if (!name) return res.status(400).json({ error: 'Restaurant name is required' });

        const restaurant = await prisma.restaurants.create({
            data: {
                name,
                slug: slug || `${name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).substring(2, 7)}`,
                phone,
                address: city ? `${address || ''}, ${city}` : address,
                subscription_plan: subscription_plan || 'BASIC',
                subscription_status: subscription_status || 'trial',
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        console.log(`[REGISTRATION] New restaurant created: ${restaurant.name} (${restaurant.id})`);
        res.status(201).json(restaurant);
    } catch (error: any) {
        console.error('[ERROR] POST /api/restaurants:', error.message);
        res.status(500).json({ error: error.message || 'Failed to create restaurant' });
    }
});

/**
 * POST /api/staff
 * Create a new staff record (Initial Owner or regular staff)
 */
app.post('/api/staff', async (req, res) => {
    try {
        const { id, restaurant_id, name, role, pin, phone, status } = req.body;

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
        // Only include custom id if it's a valid non-empty string (the DB will generate a UUID otherwise)
        if (id && typeof id === 'string' && id.trim().length > 0) {
            staffData.id = id.trim();
        }

        const staff = await prisma.staff.create({ data: staffData });

        console.log(`[REGISTRATION] Staff created: ${staff.name} as ${staff.role} for ${restaurant_id}`);
        res.status(201).json(staff);
    } catch (error: any) {
        console.error('[ERROR] POST /api/staff:', error.message);
        res.status(500).json({ error: error.message || 'Failed to create staff' });
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
app.delete('/api/restaurants/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.restaurants.delete({ where: { id } });
        res.json({ success: true, message: 'Restaurant deleted' });
    } catch (error: any) {
        console.error('[ERROR] DELETE /api/restaurants/:id:', error.message);
        res.status(500).json({ error: error.message || 'Failed to delete restaurant' });
    }
});

/**
 * POST /api/auth/verify-pin
 * Verify a PIN for specific action authorization (Manager PIN override)
 */
app.post('/api/auth/verify-pin', async (req, res) => {
    const { pin, requiredRole } = req.body;

    if (!pin || typeof pin !== 'string') {
        return res.status(400).json({ error: 'PIN is required' });
    }

    try {
        const staff = await prisma.staff.findFirst({
            where: {
                pin: pin,
                status: 'active'
            }
        });

        if (!staff) {
            return res.status(401).json({ error: 'Invalid PIN' });
        }

        // Check role if required
        if (requiredRole && staff.role !== 'MANAGER' && staff.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Manager privileges required' });
        }

        res.json({
            success: true,
            staff: {
                id: staff.id,
                name: staff.name,
                role: staff.role
            }
        });
    } catch (e: any) {
        console.error('[ERROR] /api/auth/verify-pin:', e.message);
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

    if (!refresh_token) {
        return res.status(400).json({ error: 'Missing refresh_token' });
    }

    try {
        // Verify refresh token
        const decoded = jwtService.verifyToken(refresh_token);

        if (!decoded.valid || !decoded.payload) {
            return res.status(401).json({
                error: decoded.error || 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }

        // Verify this is actually a refresh token, not an access token
        if (decoded.payload.type !== 'refresh') {
            return res.status(401).json({
                error: 'Invalid token type. Use refresh token here.',
                code: 'WRONG_TOKEN_TYPE'
            });
        }

        // Verify staff still exists and is active
        const staff = await prisma.staff.findUnique({
            where: { id: decoded.payload.staffId }
        });

        if (!staff || staff.status !== 'active') {
            return res.status(401).json({
                error: 'Staff member is no longer active',
                code: 'STAFF_INACTIVE'
            });
        }

        // Generate new access token
        const newAccessToken = jwtService.generateAccessToken(
            decoded.payload.staffId,
            decoded.payload.restaurantId,
            decoded.payload.role,
            decoded.payload.name
        );

        // TODO (Phase 2c): Optionally rotate refresh token here
        // const newRefreshToken = jwtService.generateRefreshToken(...);

        res.json({
            access_token: newAccessToken,
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

    if (!staffId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        // Audit log: Record logout
        await prisma.audit_logs.create({
            data: {
                restaurant_id: req.restaurantId,
                staff_id: staffId,
                action_type: 'STAFF_LOGOUT',
                entity_type: 'STAFF',
                entity_id: staffId,
                details: {
                    timestamp: new Date().toISOString()
                }
            }
        });

        // TODO (Phase 2c): Add token to blacklist
        res.json({ success: true, message: 'Logged out successfully' });

    } catch (error: any) {
        console.error('[ERROR] /api/auth/logout:', error.message);
        res.status(500).json({ error: 'Logout failed' });
    }
});


// ==========================================
// ⚙️ 2. OPERATIONAL ROUTES (SPECIFIC)
// ==========================================

// Get operations config for a restaurant
app.get('/api/operations/config/:restaurantId', authMiddleware, async (req, res) => {
    const { restaurantId } = req.params;

    // SaaS Security: Only allow fetching config for own restaurant
    if (req.restaurantId !== restaurantId) {
        return res.status(403).json({ error: 'Access denied: Cannot access configuration for another restaurant' });
    }

    try {
        // Return default operations config
        // TODO: When adding operations_config table, fetch from there instead
        res.json({
            success: true,
            config: {
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

        io.emit('config:updated', { restaurantId, config });

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
            result = await service.updateOrder(data.id, data);
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

        io.emit('db_change', { table: 'orders', eventType: 'UPDATE', data: result });
        res.json(result);
    } catch (e: any) {
        console.error("Order Upsert Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Fire order to kitchen (KDS)
app.post('/api/orders/:id/fire', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        let { type } = req.body;

        if (!type) {
            const order = await prisma.orders.findUnique({
                where: {
                    id,
                    restaurant_id: req.restaurantId // SaaS Security
                }
            });
            if (!order) return res.status(404).json({ error: 'Order not found' });
            type = order.type;
        }

        const service = OrderServiceFactory.getService(type);
        const result = await service.fireOrderToKitchen(id, io);

        res.json({
            success: true,
            order: result
        });
    } catch (e: any) {
        console.error("Order Fire Error:", e);
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

        io.emit('db_change', { table: 'orders', eventType: 'INSERT', data: result });
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

        // SaaS Security: Force tenant isolation verify
        const order = await prisma.orders.findUnique({
            where: {
                id,
                restaurant_id: req.restaurantId
            }
        });

        if (!order) return res.status(404).json({ error: 'Order not found or unauthorized' });

        if (!data.type) data.type = order.type;

        const service = OrderServiceFactory.getService(data.type);
        const result = await service.updateOrder(id, data);

        io.emit('db_change', { table: 'orders', eventType: 'UPDATE', data: result });
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
        const success = await service.deleteOrder(id);

        if (success) {
            io.emit('db_change', { table: 'orders', eventType: 'DELETE', id });
            // If it was a DINE_IN order, also notify about table change
            if (order.type === 'DINE_IN' && order.table_id) {
                io.emit('db_change', { table: 'tables', eventType: 'UPDATE', id: order.table_id, data: { status: 'AVAILABLE', active_order_id: null } });
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
app.post('/api/orders/:id/settle', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, paymentMethod, payment_method } = req.body;
        const method = paymentMethod || payment_method || 'CASH';
        const receivedAmount = Number(amount);
        const staffId = req.staffId; // Use authenticated staffId

        if (!receivedAmount || receivedAmount <= 0) {
            return res.status(400).json({ error: 'Valid amount required' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const order = await tx.orders.findFirst({
                where: {
                    id,
                    restaurant_id: req.restaurantId // SaaS Security
                }
            });
            if (!order) throw new Error('Order not found or unauthorized');

            // 1. Update Order
            const updatedOrder = await tx.orders.update({
                where: { id },
                data: {
                    status: 'CLOSED',
                    payment_status: 'PAID',
                    // payment_method: method, // Assuming this field might not exist on all schemas, rely on transactions/ledger
                    closed_at: new Date()
                }
            });

            // 2. Create Transaction
            await tx.transactions.create({
                data: {
                    restaurant_id: order.restaurant_id,
                    order_id: order.id,
                    amount: receivedAmount,
                    payment_method: method,
                    status: 'PAID',
                    transaction_ref: `POS-${Date.now()}`
                }
            });

            // 3. Clear Table (if Dine-In)
            if (order.type === 'DINE_IN' && order.table_id) {
                await tx.tables.update({
                    where: { id: order.table_id },
                    data: {
                        status: 'AVAILABLE',
                        active_order_id: null
                    }
                });
            }

            // 4. Accounting Entry
            if (order.type === 'DELIVERY' && order.status === 'DELIVERED') {
                // For already delivered orders, revenue was already recorded.
                // We only need to clear the rider's liability and record cash receipt.
                await accounting.recordRiderSettlement({
                    restaurantId: order.restaurant_id,
                    riderId: order.assigned_driver_id!,
                    amountReceived: receivedAmount,
                    orderIds: [order.id],
                    processedBy: staffId || order.last_action_by || 'SYSTEM',
                    settlementId: `POS-${order.id}`
                }, tx);
            } else {
                // For normal sales (Dine-In/Takeaway/Direct Delivery Settle)
                await accounting.recordOrderSale(order.id, tx);
            }

            return updatedOrder;
        });

        io.emit('db_change', { table: 'orders', eventType: 'UPDATE', data: result, id });
        io.emit('db_change', { table: 'transactions', eventType: 'INSERT' });
        if (result.type === 'DINE_IN' && result.table_id) {
            io.emit('db_change', { table: 'tables', eventType: 'UPDATE', id: result.table_id });
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
        res.status(500).json({ error: e.message });
    }
});

// Mount delivery/rider routes (SaaS Protected)
app.use('/api', authMiddleware, deliveryRoutes);
app.use('/api', authMiddleware, customerRoutes);
app.use('/api/accounting', authMiddleware, accountingRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);

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
// 👑 SUPER ADMIN ROUTES
// ==========================================

app.get('/api/super-admin/restaurants', authMiddleware, async (req, res) => {
    if (req.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Super Admin privileges required' });
    }
    try {
        const restaurants = await superAdminService.getRestaurantsOverview();
        res.json(restaurants);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/super-admin/licenses/generate', authMiddleware, async (req, res) => {
    if (req.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Super Admin privileges required' });
    }
    try {
        const license = await superAdminService.generateLicenseKey(req.body);
        res.json(license);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/super-admin/licenses', authMiddleware, async (req, res) => {
    if (req.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Super Admin privileges required' });
    }
    try {
        const licenses = await superAdminService.getLicenseKeys();
        res.json(licenses);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/super-admin/licenses/revoke', authMiddleware, async (req, res) => {
    if (req.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Super Admin privileges required' });
    }
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Missing ID' });
        const result = await superAdminService.revokeLicenseKey(String(id));
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/super-admin/licenses/apply', authMiddleware, async (req, res) => {
    // Note: Apply can be done by a Manager of the restaurant or Super Admin
    try {
        const { restaurantId, licenseKey } = req.body;
        if (!restaurantId || !licenseKey) {
            return res.status(400).json({ error: 'Missing restaurantId or licenseKey' });
        }
        const license = await superAdminService.applyLicenseKey(restaurantId, licenseKey);
        res.json(license);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 📊 3. ANALYTICS
// ==========================================
app.get('/api/analytics/summary', authMiddleware, async (req, res) => {
    const restaurant_id = req.restaurantId; // SaaS Security
    try {
        const salesAgg = await prisma.transactions.aggregate({
            where: { restaurant_id: String(restaurant_id) },
            _sum: { amount: true },
            _count: { id: true }
        });

        // v3.0 analytics logic
        const activeOrdersCount = await prisma.orders.count({
            where: {
                restaurant_id: String(restaurant_id),
                status: 'ACTIVE'
            }
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

app.get('/api/menu_items', async (req, res) => {
    const { restaurant_id } = req.query;
    try {
        const items = await prisma.menu_items.findMany({
            where: restaurant_id ? { restaurant_id: String(restaurant_id) } : {},
            include: { menu_categories: true },
            orderBy: { name: 'asc' }
        });
        res.json(items);
    } catch (e: any) {
        console.error('GET /api/menu_items ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/menu_items', async (req, res) => {
    try {
        const item = await prisma.menu_items.create({ data: req.body });
        io.emit('db_change', { table: 'menu_items', eventType: 'INSERT', data: item });
        res.json(item);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/menu_items', async (req, res) => {
    const { id, restaurant_id, ...data } = req.body;
    if (!id || !restaurant_id) return res.status(400).json({ error: 'Missing id or restaurant_id' });
    try {
        // Security: Ensure item belongs to restaurant
        const item = await prisma.menu_items.update({
            where: { id, restaurant_id }, // strict check
            data
        });
        io.emit('db_change', { table: 'menu_items', eventType: 'UPDATE', data: item });
        res.json(item);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/menu_items', async (req, res) => {
    const { id } = req.query;
    try {
        await prisma.menu_items.delete({ where: { id: String(id) } });
        io.emit('db_change', { table: 'menu_items', eventType: 'DELETE', id });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Categories
app.get('/api/menu_categories', async (req, res) => {
    const { restaurant_id } = req.query;
    try {
        const cats = await prisma.menu_categories.findMany({
            where: restaurant_id ? { restaurant_id: String(restaurant_id) } : {},
            orderBy: { priority: 'asc' }
        });
        res.json(cats);
    } catch (e: any) {
        console.error('GET /api/menu_categories ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/menu_categories', async (req, res) => {
    try {
        const cat = await prisma.menu_categories.create({ data: req.body });
        io.emit('db_change', { table: 'menu_categories', eventType: 'INSERT', data: cat });
        res.json(cat);
    } catch (e: any) {
        console.error('POST /api/menu_categories ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/menu_categories', async (req, res) => {
    const { id, ...data } = req.body;
    try {
        const cat = await prisma.menu_categories.update({ where: { id: String(id) }, data });
        io.emit('db_change', { table: 'menu_categories', eventType: 'UPDATE', data: cat });
        res.json(cat);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/menu_categories', async (req, res) => {
    const { id } = req.query;
    try {
        await prisma.menu_categories.delete({ where: { id: String(id) } });
        io.emit('db_change', { table: 'menu_categories', eventType: 'DELETE', id });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 🏗️ 5. SECTIONS & TABLES
// ==========================================

// 🚨 SECURITY: RESTRICTED API ROUTES
// Individual routes implemented for security and relational includes

app.get('/api/orders', async (req, res) => {
    const { restaurant_id } = req.query;
    try {
        const orders = await prisma.orders.findMany({
            where: restaurant_id ? { restaurant_id: String(restaurant_id) } : {},
            include: {
                order_items: true
            },
            orderBy: { created_at: 'desc' },
            take: 100
        });
        res.json(orders);
    } catch (e: any) {
        console.error('❌ Orders API Error:', e.message, e.code, e.meta);
        res.status(500).json({ error: e.message || 'Failed to fetch orders', code: e.code });
    }
});

app.get('/api/tables', async (req, res) => {
    const { restaurant_id } = req.query;
    try {
        const tables = await prisma.tables.findMany({
            where: restaurant_id ? { restaurant_id: String(restaurant_id) } : {},
            orderBy: { name: 'asc' }
        });
        res.json(tables);
    } catch (e: any) {
        console.error('GET /api/tables ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/sections', async (req, res) => {
    const { restaurant_id } = req.query;
    try {
        const sections = await prisma.sections.findMany({
            where: restaurant_id ? { restaurant_id: String(restaurant_id) } : {},
            orderBy: { priority: 'asc' }
        });
        res.json(sections);
    } catch (e: any) {
        console.error('GET /api/sections ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/staff', async (req, res) => {
    const { restaurant_id } = req.query;
    try {
        const staff = await prisma.staff.findMany({
            where: {
                ...(restaurant_id ? { restaurant_id: String(restaurant_id) } : {}),
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

        // Sanitize: Do not send PINs
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

app.get('/api/transactions', async (req, res) => {
    const { restaurant_id } = req.query;
    try {
        const transactions = await prisma.transactions.findMany({
            where: restaurant_id ? { restaurant_id: String(restaurant_id) } : {},
            orderBy: { created_at: 'desc' }
        });
        res.json(transactions);
    } catch (e: any) {
        console.error('GET /api/transactions ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/customers', async (req, res) => {
    const { restaurant_id } = req.query;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });
    try {
        const customers = await accounting.getCustomerIntelligence(String(restaurant_id));
        res.json(customers);
    } catch (e: any) {
        console.error('GET /api/customers ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/vendors', async (req, res) => {
    const { restaurant_id } = req.query;
    try {
        const vendors = await prisma.vendors.findMany({
            where: restaurant_id ? { restaurant_id: String(restaurant_id) } : {},
            orderBy: { name: 'asc' }
        });
        res.json(vendors);
    } catch (e: any) {
        console.error('GET /api/vendors ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

// Sections
app.post('/api/sections', async (req, res) => {
    try {
        console.log('POST /api/sections body:', req.body);
        const section = await createSection(req.body, io);
        res.json(section);
    } catch (e: any) {
        console.error('POST /api/sections ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/sections', async (req, res) => {
    const { id, restaurant_id, ...data } = req.body;
    if (!id || !restaurant_id) return res.status(400).json({ error: 'Missing id or restaurant_id' });
    try {
        const section = await updateSection(id, restaurant_id, data, io);
        res.json(section);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sections/reorder', async (req, res) => {
    const { restaurant_id, reordered_ids } = req.body;
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

app.delete('/api/sections', async (req, res) => {
    const { id } = req.query;
    try {
        await deleteSection(String(id), io);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Tables
app.post('/api/tables', async (req, res) => {
    try {
        const table = await createTable(req.body, io);
        res.json(table);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/tables', async (req, res) => {
    const { id, restaurant_id, ...data } = req.body;
    if (!id || !restaurant_id) return res.status(400).json({ error: 'Missing id or restaurant_id' });
    try {
        const table = await updateTable(id, restaurant_id, data, io);
        res.json(table);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/tables', async (req, res) => {
    const { id } = req.query;
    try {
        await deleteTable(String(id), io);
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
// 🧑‍🤝‍🧑 6. CUSTOMERS & VENDORS
// ==========================================

// Customers
app.post('/api/customers', async (req, res) => {
    try {
        const customer = await prisma.customers.create({ data: req.body });
        io.emit('db_change', { table: 'customers', eventType: 'INSERT', data: customer });
        res.json(customer);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/customers', async (req, res) => {
    const { id, ...data } = req.body;
    try {
        const customer = await prisma.customers.update({ where: { id }, data });
        io.emit('db_change', { table: 'customers', eventType: 'UPDATE', data: customer });
        res.json(customer);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Vendors
app.post('/api/vendors', async (req, res) => {
    try {
        const vendor = await prisma.vendors.create({ data: req.body });
        io.emit('db_change', { table: 'vendors', eventType: 'INSERT', data: vendor });
        res.json(vendor);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/vendors', async (req, res) => {
    const { id, ...data } = req.body;
    try {
        const vendor = await prisma.vendors.update({ where: { id }, data });
        io.emit('db_change', { table: 'vendors', eventType: 'UPDATE', data: vendor });
        res.json(vendor);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Stations
app.get('/api/stations', async (req, res) => {
    const { restaurant_id } = req.query;
    try {
        console.log('GET /api/stations for restaurant:', restaurant_id);
        const stations = await prisma.stations.findMany({
            where: restaurant_id ? { restaurant_id: String(restaurant_id) } : {},
            orderBy: { name: 'asc' }
        });
        res.json(stations);
    } catch (e: any) {
        console.error('GET /api/stations ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/stations', async (req, res) => {
    try {
        const station = await prisma.stations.create({ data: req.body });
        io.emit('db_change', { table: 'stations', eventType: 'INSERT', data: station });
        res.json(station);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/stations', async (req, res) => {
    const { id, ...data } = req.body;
    try {
        const station = await prisma.stations.update({ where: { id }, data });
        io.emit('db_change', { table: 'stations', eventType: 'UPDATE', data: station });
        res.json(station);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/stations', async (req, res) => {
    const { id } = req.query;
    try {
        await prisma.stations.delete({ where: { id: String(id) } });
        io.emit('db_change', { table: 'stations', eventType: 'DELETE', id });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


// ==========================================
// 📦 6. SYSTEM UTILITIES
// ==========================================

app.post('/api/system/seed-restaurant', async (req, res) => {
    const { restaurantId } = req.body;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurant ID required' });

    try {
        // 1. Check if already seeded (by looking for a known section)
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

        // 2. Safe creation with upsert where possible
        const mainHall = await prisma.sections.upsert({
            where: {
                restaurant_id_name: {
                    restaurant_id: restaurantId,
                    name: 'Main Hall'
                }
            },
            update: {}, // nothing to update if exists
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
                name_urdu: 'بیف برگر',
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

app.post('/api/system/reset-environment', async (req, res) => {
    const { restaurantId } = req.body;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurant ID required' });

    console.log(`🧹 RESET REQUEST FOR RESTAURANT: ${restaurantId}`);

    try {
        // Delete extension tables first (sequential to avoid schema issues)
        console.log('   - Deleting extension tables...');
        await prisma.dine_in_orders.deleteMany({});
        await prisma.takeaway_orders.deleteMany({});
        await prisma.delivery_orders.deleteMany({});
        await prisma.reservation_orders.deleteMany({});
        await prisma.order_items.deleteMany({});

        // Delete financial records
        console.log('   - Deleting financial records...');
        await prisma.transactions.deleteMany({ where: { restaurant_id: restaurantId } });
        await prisma.expenses.deleteMany({ where: { restaurant_id: restaurantId } });
        await prisma.reservations.deleteMany({ where: { restaurant_id: restaurantId } });

        // Delete core orders
        console.log('   - Deleting core orders...');
        await prisma.orders.deleteMany({ where: { restaurant_id: restaurantId } });

        // Reset table statuses
        console.log('   - Resetting table statuses...');
        await prisma.tables.updateMany({
            where: { restaurant_id: restaurantId },
            data: { status: 'AVAILABLE', active_order_id: null, merge_id: null }
        });

        console.log('✅ RESET COMPLETE');

        // Broadcast to all clients
        io.emit('db_change', { table: 'orders', eventType: 'DELETE', id: 'ALL' });
        io.emit('db_change', { table: 'tables', eventType: 'UPDATE', id: 'ALL' });
        io.emit('db_change', { table: 'transactions', eventType: 'DELETE', id: 'ALL' });

        res.json({ success: true, message: "Environment reset successfully. Database is now clean." });
    } catch (e: any) {
        console.error("Reset Failed:", e);
        res.status(500).json({ error: e.message });
    }
});
// (Moved higher up)

// Route to fetch specific order with all its relational extensions
app.get('/api/orders/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        // Skip if ID is actually a route name
        if (['all', 'summary', 'upsert', 'fire'].includes(id)) return next();

        const order = await prisma.orders.findUnique({
            where: { id },
            include: {
                order_items: true,
                dine_in_orders: true,
                takeaway_orders: true,
                delivery_orders: true,
                reservation_orders: true
            }
        });
        if (!order) {
            // Try searching by order_number if not found as UUID
            const byNumber = await prisma.orders.findUnique({
                where: { order_number: id },
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

app.post('/api/orders/:id/settle', async (req, res) => {
    const { id } = req.params;
    const { amount, payment_method, transaction_ref, restaurant_id, staff_id } = req.body;

    try {
        const order = await prisma.orders.findUnique({
            where: { id },
            include: { dine_in_orders: true }
        });

        if (!order) return res.status(404).json({ error: 'Order not found' });

        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Transaction
            const transaction = await tx.transactions.create({
                data: {
                    restaurant_id,
                    order_id: id,
                    amount,
                    payment_method,
                    status: 'PAID',
                    transaction_ref,
                    created_at: new Date()
                }
            });

            // 2. Update Order Status, Total, and Audit Trail (v3.0: CLOSED + PAID)
            const updatedOrder = await (tx.orders as any).update({
                where: { id },
                data: {
                    status: 'CLOSED', // v3.0: PAID is no longer a status, use CLOSED
                    payment_status: 'PAID', // v3.0: Explicit payment status
                    total: amount,
                    last_action_by: staff_id,
                    last_action_desc: `Settle: ${payment_method} - Rs. ${amount}`,
                    updated_at: new Date()
                }
            });

            // 3. If Dine-In, Release Table (Mark as DIRTY for cleanup)
            const dineIn = order.dine_in_orders; // v3.0: Corrected from array to object access
            if (order.type === 'DINE_IN' && dineIn) {
                const tableId = (dineIn as any).table_id;
                await tx.tables.update({
                    where: { id: tableId },
                    data: {
                        status: 'DIRTY',
                        active_order_id: null
                    }
                });
            }

            // 4. Record in Financial Ledger
            await accounting.recordOrderSale(id, tx);

            return { transaction, updatedOrder };
        });

        // 4. Notify via Socket
        io.to(`restaurant:${restaurant_id}`).emit('db_change', {
            table: 'orders',
            eventType: 'UPDATE',
            data: result.updatedOrder
        });

        io.to(`restaurant:${restaurant_id}`).emit('db_change', {
            table: 'transactions',
            eventType: 'INSERT',
            data: result.transaction
        });

        if (order.type === 'DINE_IN' && order.dine_in_orders) {
            const tableId = order.dine_in_orders.table_id;
            const updatedTable = await prisma.tables.findUnique({ where: { id: tableId } });
            io.to(`restaurant:${restaurant_id}`).emit('db_change', {
                table: 'tables',
                eventType: 'UPDATE',
                data: updatedTable
            });
        }

        res.json({ success: true, ...result });
    } catch (e: any) {
        console.error(`POST /api/orders/${id}/settle ERROR:`, e);
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 🔐 DEVICE PAIRING ENDPOINTS (SECURE)
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
app.post('/api/pairing/generate', pairingGenerateLimiter, async (req, res) => {
    const { restaurantId } = req.body;
    const staffId = req.headers['x-staff-id'] as string; // TODO: Replace with JWT after Phase 2b

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
        const { code, expiresAt, id } = await generatePairingCode(restaurantId, staffId);

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

    // Input validation
    if (!restaurantId || !codeId || !code || !deviceFingerprint || !deviceName || !platform) {
        return res.status(400).json({ error: 'Missing required pairing fields' });
    }

    // Validate code format (should be 6 chars)
    if (!/^[A-Z0-9]{6}$/.test(code)) {
        return res.status(400).json({ error: 'Invalid code format' });
    }

    try {
        // Verify code exists and belongs to this restaurant
        const pairingCode = await prisma.pairing_codes.findFirst({
            where: {
                id: codeId,
                restaurant_id: restaurantId
            }
        });

        if (!pairingCode) {
            return res.status(404).json({ error: 'Pairing code not found' });
        }

        // Get the staff member who created this code (for audit)
        // In production: extract staffId from JWT. For now, we need it from somewhere.
        // TEMPORARY: We'll use the code's used_by field after verification
        // TODO: After JWT implementation, get staffId from token

        // For now, we'll do verification first, then use the staff context
        // This is a temporary workaround — proper auth will fix this in Phase 2b

        const { authToken, deviceId } = await verifyPairingCode(
            restaurantId,
            pairingCode.used_by || 'system', // Placeholder, will be replaced by JWT staffId
            codeId,
            code,
            deviceFingerprint,
            deviceName,
            userAgent,
            platform
        );

        // Notify restaurant via Socket.IO: new device paired
        io.to(`restaurant:${restaurantId}`).emit('device_change', {
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
app.get('/api/pairing/devices', async (req, res) => {
    const staffId = req.headers['x-staff-id'] as string;
    const restaurantId = req.headers['x-restaurant-id'] as string;

    if (!staffId || !restaurantId) {
        return res.status(400).json({ error: 'Missing staffId or restaurantId' });
    }

    try {
        const devices = await listPairedDevices(restaurantId, staffId);
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
app.delete('/api/pairing/devices/:deviceId', async (req, res) => {
    const { deviceId } = req.params;
    const staffId = req.headers['x-staff-id'] as string;
    const restaurantId = req.headers['x-restaurant-id'] as string;

    if (!staffId || !restaurantId) {
        return res.status(400).json({ error: 'Missing staffId or restaurantId' });
    }

    try {
        await disableDevice(deviceId, staffId, restaurantId);

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
app.post('/api/audit-logs', async (req, res) => {
    try {
        const { restaurant_id, staff_id, action_type, entity_type, entity_id, details, ip_address } = req.body;

        const log = await prisma.audit_logs.create({
            data: {
                restaurant_id,
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

app.get('/api/audit-logs', async (req, res) => {
    try {
        const { restaurant_id, limit = '100', offset = '0' } = req.query;
        if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });

        const logs = await prisma.audit_logs.findMany({
            where: { restaurant_id: String(restaurant_id) },
            orderBy: { created_at: 'desc' },
            take: Number(limit),
            skip: Number(offset),
            include: { staff: true }
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

        // Validate status
        if (!['verified', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Status must be "verified" or "rejected"' });
        }

        // Only admins can verify payments
        if (req.role !== 'SUPER_ADMIN' && req.role !== 'MANAGER') {
            return res.status(403).json({ error: 'Only admins can verify payments' });
        }

        // Update payment in Supabase (via raw SQL or direct API call)
        // For now, we'll just log this and send notification
        // In production, this would update the actual payment record in Supabase

        console.log(`[PAYMENT] Updating payment ${paymentId} to ${status}`);

        // Simulate fetching the payment (in real implementation, fetch from Supabase)
        const restaurantId = req.body.restaurant_id;
        const restaurant = await prisma.restaurants.findUnique({
            where: { id: restaurantId },
            select: { name: true, phone: true, subscription_plan: true }
        });

        if (!restaurant) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        // Send notification based on status
        try {
            if (status === 'verified') {
                await sendPaymentVerified({
                    name: restaurant.name,
                    phone: restaurant.phone || '',
                    plan: (restaurant.subscription_plan as any) || 'STANDARD'
                });
            } else if (status === 'rejected') {
                await sendPaymentRejected({
                    name: restaurant.name,
                    phone: restaurant.phone || '',
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

/**
 * GET /api/:table
 * Generic endpoint for querying any table via apiClient
 * Supports: ?field=value filters, &$limit=N, &$order=field.asc|desc
 */
app.get('/api/:table', authMiddleware, async (req, res) => {
    const { table } = req.params;
    const { $limit, $order, ...filters } = req.query;

    // Whitelist tables to prevent injection
    const allowedTables = [
        'subscription_payments', 'orders', 'staff', 'restaurants',
        'customers', 'tables', 'sections', 'menu_items', 'menu_categories',
        'delivery_orders', 'takeaway_orders', 'transactions', 'vendors', 'stations',
        'parked_orders', 'audit_logs', 'registered_devices'
    ];

    if (!allowedTables.includes(table as string)) {
        return res.status(400).json({ error: `Table '${table}' not exposed via generic API` });
    }

    try {
        // Check if table exists in Prisma schema
        if (!((prisma as any)[table])) {
            console.warn(`[WARN] GET /api/${table}: Table not found in Prisma schema`);
            return res.status(404).json({ error: `Table '${table}' not found in database schema` });
        }

        const where: any = {};

        // Build WHERE clause from filters
        Object.entries(filters).forEach(([key, value]) => {
            if (typeof value === 'string') {
                if (value.startsWith('neq.')) {
                    where[key] = { not: value.replace('neq.', '') };
                } else {
                    where[key] = value;
                }
            }
        });

        // Build orderBy
        let orderBy: any = { created_at: 'desc' };
        if ($order && typeof $order === 'string') {
            const [field, direction] = $order.split('.');
            orderBy = { [field]: direction === 'desc' ? 'desc' : 'asc' };
        }

        console.log(`[API] GET /api/${table}`, { filters, orderBy, limit: $limit || 100 });

        // Execute query
        const data = await (prisma as any)[table].findMany({
            where,
            orderBy,
            take: $limit ? Number($limit) : 100
        });

        res.json(data || []);
    } catch (error: any) {
        console.error(`[ERROR] GET /api/${table}:`, error.message, error.code);
        res.status(500).json({
            error: error.message || `Failed to fetch ${table}`,
            code: error.code
        });
    }
});

app.post('/api/super-admin/payments/verify', authMiddleware, async (req, res) => {
    if (req.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Super Admin privileges required' });
    }
    try {
        const { paymentId, status } = req.body;
        if (!paymentId || !['verified', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid paymentId or status' });
        }
        const result = await superAdminService.verifyPayment(paymentId, status, req.staffId);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// Generic API - Write Operations
// ==========================================

app.post('/api/:table', authMiddleware, async (req, res) => {
    const { table } = req.params;
    const allowedTables = [
        'subscription_payments', 'orders', 'staff', 'restaurants',
        'customers', 'tables', 'sections', 'menu_items', 'menu_categories',
        'delivery_orders', 'takeaway_orders', 'transactions', 'vendors', 'stations',
        'parked_orders', 'audit_logs', 'registered_devices'
    ];

    if (!allowedTables.includes(table)) {
        return res.status(400).json({ error: `Table '${table}' not exposed via generic API` });
    }

    try {
        if (!((prisma as any)[table])) {
            return res.status(404).json({ error: `Table '${table}' not found in database schema` });
        }

        const data = await (prisma as any)[table].create({
            data: {
                ...req.body,
                restaurant_id: req.body.restaurant_id || req.restaurantId
            }
        });
        res.status(201).json(data);
    } catch (error: any) {
        console.error(`[ERROR] POST /api/${table}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

app.patch('/api/:table', authMiddleware, async (req, res) => {
    const { table } = req.params;
    const { id } = req.query;

    const allowedTables = [
        'subscription_payments', 'orders', 'staff', 'restaurants',
        'customers', 'tables', 'sections', 'menu_items', 'menu_categories',
        'delivery_orders', 'takeaway_orders', 'transactions', 'vendors', 'stations',
        'parked_orders', 'audit_logs', 'registered_devices'
    ];

    if (!allowedTables.includes(table)) {
        return res.status(400).json({ error: `Table '${table}' not exposed via generic API` });
    }

    if (!id) {
        return res.status(400).json({ error: 'Missing ID for patch operation' });
    }

    try {
        if (!((prisma as any)[table])) {
            return res.status(404).json({ error: `Table '${table}' not found in database schema` });
        }

        const data = await (prisma as any)[table].update({
            where: { id: String(id) },
            data: req.body
        });
        res.json(data);
    } catch (error: any) {
        console.error(`[ERROR] PATCH /api/${table}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/:table', authMiddleware, async (req, res) => {
    const { table } = req.params;
    const { id } = req.query;

    const allowedTables = [
        'subscription_payments', 'orders', 'staff', 'restaurants',
        'customers', 'tables', 'sections', 'menu_items', 'menu_categories',
        'delivery_orders', 'takeaway_orders', 'transactions', 'vendors', 'stations',
        'parked_orders', 'audit_logs', 'registered_devices'
    ];

    if (!allowedTables.includes(table)) {
        return res.status(400).json({ error: `Table '${table}' not exposed via generic API` });
    }

    if (!id) {
        return res.status(400).json({ error: 'Missing ID for delete operation' });
    }

    try {
        if (!((prisma as any)[table])) {
            return res.status(404).json({ error: `Table '${table}' not found in database schema` });
        }

        await (prisma as any)[table].delete({
            where: { id: String(id) }
        });
        res.json({ success: true });
    } catch (error: any) {
        console.error(`[ERROR] DELETE /api/${table}:`, error.message);
        res.status(500).json({ error: error.message });
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

    // Start subscription checker job
    if (config.NODE_ENV !== 'test') {
        startSubscriptionChecker();

        logger.log({
            level: LogLevel.INFO,
            service: 'startup',
            action: 'subscription_checker_started'
        });
    }
});
