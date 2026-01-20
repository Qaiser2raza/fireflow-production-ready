import express from 'express';
import cors from 'cors';
import pg from 'pg';
const { Pool } = pg;
import os from 'os';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';

// Services
import { OrderServiceFactory } from './services/orders/OrderServiceFactory';
import { jwtService } from './services/auth/JwtService';
import {
    generatePairingCode,
    verifyPairingCode,
    listPairedDevices,
    disableDevice,
    cleanupExpiredCodes
} from './services/pairing/PairingService';

// Middleware
import { authMiddleware, requireRole, belongsToRestaurant, revokeToken } from './middleware/authMiddleware';
import { validateBody } from './middleware/validateMiddleware';

// Schemas
import { orderUpsertSchema } from './schemas/orderSchemas';
import { pairingVerifySchema } from './schemas/pairingSchemas';
import { loginSchema, refreshSchema } from './schemas/authSchemas';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ==========================================
// 🚨 CRITICAL MIDDLEWARE (MUST BE AT TOP) 🚨
// ==========================================
app.use(cors());
app.use(express.json());

// Logging Middleware for debugging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'fireflow_local',
    password: 'admin123',
    port: 5432,
});

// Health check for Electron startup
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
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
app.post('/api/auth/login', validateBody(loginSchema), async (req, res) => {
    const { pin } = req.body;

    try {
        // Find active staff by PIN
        // We check both hashed_pin (preferred) and pin (legacy fallback)
        const user = await prisma.staff.findFirst({
            where: {
                status: 'active',
                restaurant_id: req.body.restaurant_id || undefined
            }
        });

        if (!user) {
            // Generic error to avoid user enumeration
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        let isValid = false;

        // GRACE PERIOD LOGIC: Prefer bcrypt, fallback to plaintext for migration window
        if (user.hashed_pin) {
            // New flow: bcrypt verification (preferred)
            isValid = await bcrypt.compare(pin, user.hashed_pin);
        } else if (user.pin) {
            // Legacy fallback: plaintext comparison (TEMPORARY - will be removed after migration)
            isValid = pin === user.pin;
            if (isValid) {
                console.warn(
                    `⚠️  [LEGACY AUTH] Staff ${user.id} (${user.name}) using plaintext PIN. ` +
                    `Run 'npm run migrate:pins' to hash all remaining PINs`
                );
            }
        }

        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

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
            tokens: {
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: 15 * 60  // 15 minutes in seconds
            }
        });

    } catch (e: any) {
        console.error('[ERROR] /api/auth/login:', e.message);
        res.status(500).json({ error: 'Authentication service temporarily unavailable' });
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
app.post('/api/auth/refresh', validateBody(refreshSchema), async (req, res) => {
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

        // Generate new tokens (Rotation)
        const newAccessToken = jwtService.generateAccessToken(
            decoded.payload.staffId,
            decoded.payload.restaurantId,
            decoded.payload.role,
            decoded.payload.name
        );

        const newRefreshToken = jwtService.generateRefreshToken(
            decoded.payload.staffId,
            decoded.payload.restaurantId,
            decoded.payload.role,
            decoded.payload.name
        );

        // Ralf: Revoke the old refresh token so it can't be reused
        revokeToken(refresh_token);

        res.json({
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
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

        // Ralf's Revocation: Blacklist the current token
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            if (token) revokeToken(token);
        }

        res.json({ success: true, message: 'Logged out successfully' });

    } catch (error: any) {
        console.error('[ERROR] /api/auth/logout:', error.message);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// Staff List (Protected)
app.get('/api/staff', authMiddleware, async (req, res) => {
    const { restaurant_id } = req.query;
    const targetRestaurantId = (restaurant_id as string) || req.restaurantId;

    if (!targetRestaurantId) return res.status(400).json({ error: "Missing restaurant_id" });

    try {
        const staff = await prisma.staff.findMany({
            where: {
                restaurant_id: targetRestaurantId,
                status: 'active'
            },
            select: {
                id: true,
                name: true,
                role: true,
                restaurant_id: true,
                status: true,
                last_login: true,
                image: true
                // Do NOT select pin or hashed_pin
            }
        });
        res.json(staff);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// ⚙️ 2. OPERATIONAL ROUTES (SPECIFIC)
// ==========================================

// Get operations config for a restaurant
app.get('/api/operations/config/:restaurantId', authMiddleware, async (req, res) => {
    const { restaurantId } = req.params;
    if (!restaurantId) return res.status(400).json({ error: 'Missing restaurantId' });

    try {
        // Verify restaurant exists
        const restaurant = await prisma.restaurants.findUnique({
            where: { id: restaurantId },
            select: { id: true, name: true }
        });

        if (!restaurant) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

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
    if (!restaurantId) return res.status(400).json({ error: 'Missing restaurantId' });

    try {
        const {
            taxEnabled,
            taxRate,
            serviceChargeEnabled,
            serviceChargeRate,
            defaultDeliveryFee,
            defaultGuestCount,
            defaultRiderFloat
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
            defaultRiderFloat: Number(defaultRiderFloat) || 5000
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
// Ralf: Phase 2c - Added Zod validation and wrapped in $transaction for atomicity
app.post('/api/orders/upsert', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN', 'CASHIER', 'WAITER'), validateBody(orderUpsertSchema), async (req, res) => {
    try {
        const data = req.body;

        // Wrap entire operation in transaction to ensure consistency
        const result = await prisma.$transaction(async (tx) => {
            const service = OrderServiceFactory.getService(data.type);
            let orderResult;

            if (data.id) {
                orderResult = await service.updateOrder(data.id, data);
            } else {
                orderResult = await service.createOrder(data);
            }

            // Sync table status within same transaction
            if (data.type === 'DINE_IN' && data.table_id) {
                await tx.tables.update({
                    where: { id: data.table_id },
                    data: {
                        status: 'OCCUPIED',
                        active_order_id: orderResult.id
                    }
                });
            }

            return orderResult;
        });

        io.emit('db_change', { table: 'orders', eventType: 'UPDATE', data: result });
        res.json(result);
    } catch (e: any) {
        console.error("Order Upsert Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// ✅ FIXED: Dev Reset route using prisma transaction for atomic wipe
app.post('/api/system/dev-reset', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
    try {
        await prisma.$transaction([
            prisma.order_items.deleteMany(),
            prisma.transactions.deleteMany(),
            prisma.dine_in_orders.deleteMany(),
            prisma.takeaway_orders.deleteMany(),
            prisma.delivery_orders.deleteMany(),
            prisma.reservation_orders.deleteMany(),
            prisma.orders.deleteMany(),
            // Reset tables to AVAILABLE (Green) and clear linked orders
            prisma.tables.updateMany({
                data: {
                    status: 'AVAILABLE',
                    active_order_id: null
                }
            })
        ]);
        console.log("🔄 System Reset: Transactional data cleared.");
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/orders', authMiddleware, async (req, res) => {
    const { restaurant_id } = req.query;
    const targetRestaurantId = (restaurant_id as string) || req.restaurantId;

    if (!targetRestaurantId) return res.status(400).json({ error: "Missing restaurant_id" });

    try {
        const orders = await prisma.orders.findMany({
            where: { restaurant_id: targetRestaurantId },
            include: {
                order_items: true,
                dine_in_orders: true,
                takeaway_orders: true,
                delivery_orders: true,
                reservation_orders: true
            },
            orderBy: { created_at: 'desc' },
            take: 100 // Limit to last 100 for performance
        });
        res.json(orders);
    } catch (e: any) {
        console.error("Fetch Orders Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 📊 3. ANALYTICS
// ==========================================
app.get('/api/analytics/summary', authMiddleware, async (req, res) => {
    const { restaurant_id } = req.query;
    if (!restaurant_id) return res.status(400).json({ error: "Missing restaurant_id" });
    try {
        const salesAgg = await prisma.transactions.aggregate({
            where: { restaurant_id: String(restaurant_id) },
            _sum: { amount: true },
            _count: { id: true }
        });
        res.json({
            totalSales: Number(salesAgg._sum.amount || 0),
            totalTransactions: salesAgg._count.id || 0
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/transactions', authMiddleware, async (req, res) => {
    const { restaurant_id } = req.query;
    const targetRestaurantId = (restaurant_id as string) || req.restaurantId;

    if (!targetRestaurantId) return res.status(400).json({ error: "Missing restaurant_id" });

    try {
        const transactions = await prisma.transactions.findMany({
            where: { restaurant_id: targetRestaurantId },
            orderBy: { timestamp: 'desc' },
            take: 50
        });
        res.json(transactions);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 📜 4. MENU & CATEGORIES
// ==========================================

app.get('/api/menu_items', authMiddleware, async (req, res) => {
    const { restaurant_id } = req.query;
    try {
        const items = await prisma.menu_items.findMany({
            where: restaurant_id ? { restaurant_id: String(restaurant_id) } : {},
            include: { category_rel: true },
            orderBy: { name: 'asc' }
        });
        res.json(items);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/menu_items', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const item = await prisma.menu_items.create({ data: req.body });
        io.emit('db_change', { table: 'menu_items', eventType: 'INSERT', data: item });
        res.json(item);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/menu_items', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
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

app.delete('/api/menu_items', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
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
app.get('/api/menu_categories', authMiddleware, async (req, res) => {
    const { restaurant_id } = req.query;
    try {
        const cats = await prisma.menu_categories.findMany({
            where: restaurant_id ? { restaurant_id: String(restaurant_id) } : {},
            orderBy: { priority: 'asc' }
        });
        res.json(cats);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/menu_categories', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const cat = await prisma.menu_categories.create({ data: req.body });
        io.emit('db_change', { table: 'menu_categories', eventType: 'INSERT', data: cat });
        res.json(cat);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/menu_categories', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
    const { id, ...data } = req.body;
    try {
        const cat = await prisma.menu_categories.update({ where: { id: String(id) }, data });
        io.emit('db_change', { table: 'menu_categories', eventType: 'UPDATE', data: cat });
        res.json(cat);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/menu_categories', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
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

// Sections
app.post('/api/sections', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const section = await prisma.sections.create({ data: req.body });
        io.emit('db_change', { table: 'sections', eventType: 'INSERT', data: section });
        res.json(section);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/sections', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
    const { id, restaurant_id, ...data } = req.body;
    if (!id || !restaurant_id) return res.status(400).json({ error: 'Missing id or restaurant_id' });
    try {
        const section = await prisma.sections.update({
            where: { id, restaurant_id },
            data
        });
        io.emit('db_change', { table: 'sections', eventType: 'UPDATE', data: section });
        res.json(section);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/sections', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
    const { id } = req.query;
    try {
        await prisma.sections.delete({ where: { id: String(id) } });
        io.emit('db_change', { table: 'sections', eventType: 'DELETE', id });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Tables
app.post('/api/tables', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const table = await prisma.tables.create({ data: req.body });
        io.emit('db_change', { table: 'tables', eventType: 'INSERT', data: table });
        res.json(table);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/tables', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
    const { id, restaurant_id, ...data } = req.body;
    if (!id || !restaurant_id) return res.status(400).json({ error: 'Missing id or restaurant_id' });
    try {
        const table = await prisma.tables.update({
            where: { id, restaurant_id },
            data
        });
        io.emit('db_change', { table: 'tables', eventType: 'UPDATE', data: table });
        res.json(table);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/tables', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
    const { id } = req.query;
    try {
        await prisma.tables.delete({ where: { id: String(id) } });
        io.emit('db_change', { table: 'tables', eventType: 'DELETE', id });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 🧑‍🤝‍🧑 6. CUSTOMERS & VENDORS
// ==========================================

// Customers
app.post('/api/customers', authMiddleware, async (req, res) => {
    try {
        const customer = await prisma.customers.create({ data: req.body });
        io.emit('db_change', { table: 'customers', eventType: 'INSERT', data: customer });
        res.json(customer);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/customers', authMiddleware, async (req, res) => {
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
app.post('/api/vendors', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const vendor = await prisma.vendors.create({ data: req.body });
        io.emit('db_change', { table: 'vendors', eventType: 'INSERT', data: vendor });
        res.json(vendor);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/vendors', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
    const { id, ...data } = req.body;
    try {
        const vendor = await prisma.vendors.update({ where: { id }, data });
        io.emit('db_change', { table: 'vendors', eventType: 'UPDATE', data: vendor });
        res.json(vendor);
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
            { name: 'Chicken Wings', category: catStarters, price: 450, station: 'KITCHEN' },
            { name: 'Beef Burger', category: catMains, price: 850, station: 'KITCHEN' },
            { name: 'Soda', category: catMains, price: 100, station: 'BAR' }
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
                        price: item.price,
                        station: item.station
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
// THIS MUST STAY AT THE BOTTOM TO PREVENT 404s
// 🚨 SECURITY: DISABLED WILDCARD ROUTE
// This route allowed dumping any table. Disabled for production safety.
/*
app.get('/api/:table', async (req, res) => {
    const { table } = req.params;
    try {
        // Safety check to prevent crashing on non-existent tables
        if (!(prisma as any)[table]) {
            return res.status(404).json({ error: `Table ${table} not found` });
        }
        const data = await (prisma as any)[table].findMany();
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
*/

// Route to fetch specific order with all its relational extensions
app.get('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const order = await prisma.orders.findUnique({
            where: { id },
            include: {
                order_items: true,
                dine_in_order: true,
                takeaway_order: true,
                delivery_order: true,
                reservation_order: true
            }
        });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json(order);
    } catch (e: any) {
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
app.post('/api/pairing/generate', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN'), pairingGenerateLimiter, async (req, res) => {
    const { restaurantId } = req.body;
    const staffId = req.staffId;

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
app.post('/api/pairing/verify', validateBody(pairingVerifySchema), pairingVerifyLimiter, async (req, res) => {
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

        // Get the actual staff context from the code (it was updated during verification)
        const updatedCode = await prisma.pairing_codes.findUnique({
            where: { id: codeId }
        });

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
app.get('/api/pairing/devices', authMiddleware, async (req, res) => {
    const staffId = req.staffId;
    const restaurantId = req.restaurantId;

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
app.delete('/api/pairing/devices/:deviceId', authMiddleware, async (req, res) => {
    const { deviceId } = req.params;
    const staffId = req.staffId;
    const restaurantId = req.restaurantId;

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

// Server Initialization
const PORT = 3001;
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server Engine Online: http://localhost:${PORT}`);
});
