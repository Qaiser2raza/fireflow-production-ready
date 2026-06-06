/**
 * Super Admin Routes
 * Handles SaaS management endpoints: licenses, payments, restaurants overview
 * License keys and payments are stored in Supabase cloud (not local Prisma).
 */

import { Router } from 'express';
import { superAdminService } from '../services/SuperAdminService';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';

const router = Router();

// All super-admin routes require authentication + elevated role
router.use(authMiddleware);
router.use(requireRole('SUPER_ADMIN', 'MANAGER'));

// ==========================================
// LICENSE KEY MANAGEMENT
// ==========================================

/**
 * GET /api/super-admin/licenses
 * Returns all license keys (from Supabase cloud)
 */
router.get('/licenses', async (_req, res) => {
    try {
        const licenses = await superAdminService.getLicenseKeys();
        res.json(licenses || []);
    } catch (err: any) {
        console.error('[SUPER ADMIN] GET /licenses error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/super-admin/licenses/generate
 * Mint a new license key for a given plan
 * Body: { licenseType: 'BASIC' | 'STANDARD' | 'PREMIUM' | 'ENTERPRISE', restaurantId?: string }
 */
router.post('/licenses/generate', async (req, res) => {
    try {
        const { licenseType = 'STANDARD', restaurantId, deviceLimit, expiryMonths, hardwareFingerprint } = req.body;
        const result = await superAdminService.generateLicenseKey({
            restaurantId,
            licenseType,
            deviceLimit,
            expiryMonths,
            hardwareFingerprint
        });
        res.json(result);
    } catch (err: any) {
        console.error('[SUPER ADMIN] POST /licenses/generate error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/super-admin/licenses/apply
 * Apply a license key to a restaurant
 * Body: { restaurantId, key }
 */
router.post('/licenses/apply', async (req, res) => {
    try {
        const { restaurantId, key } = req.body;
        if (!restaurantId || !key) {
            return res.status(400).json({ error: 'restaurantId and key are required' });
        }
        const result = await superAdminService.applyLicenseKey(restaurantId, key);
        res.json(result);
    } catch (err: any) {
        console.error('[SUPER ADMIN] POST /licenses/apply error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PATCH /api/super-admin/licenses/:id/revoke
 * Revoke a license key
 */
router.patch('/licenses/:id/revoke', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await superAdminService.revokeLicenseKey(id);
        res.json(result);
    } catch (err: any) {
        console.error('[SUPER ADMIN] PATCH /licenses/:id/revoke error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/super-admin/licenses
 * Permanently delete a license key from cloud
 * Query: ?id=<keyId>
 */
router.delete('/licenses', async (req, res) => {
    try {
        const { id } = req.query as { id: string };
        if (!id) {
            return res.status(400).json({ error: 'License key id is required as query param ?id=' });
        }
        const result = await superAdminService.deleteLicenseKey(id);
        res.json(result);
    } catch (err: any) {
        console.error('[SUPER ADMIN] DELETE /licenses error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// PAYMENT MANAGEMENT
// ==========================================

/**
 * POST /api/super-admin/payments/verify
 * Verify or reject a subscription payment (cloud Supabase record)
 * Body: { paymentId, status: 'verified' | 'rejected', notes? }
 */
router.post('/payments/verify', async (req, res) => {
    try {
        const { paymentId, status, notes: _notes } = req.body;
        if (!paymentId || !status) {
            return res.status(400).json({ error: 'paymentId and status are required' });
        }
        if (!['verified', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'status must be "verified" or "rejected"' });
        }
        const result = await superAdminService.verifyPayment(paymentId, status, req.staffId);
        res.json({ success: true, payment: result });
    } catch (err: any) {
        console.error('[SUPER ADMIN] POST /payments/verify error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// RESTAURANT OVERVIEW
// ==========================================

/**
 * GET /api/super-admin/restaurants
 * Get all restaurants with license/subscription status (local DB)
 */
router.get('/restaurants', async (_req, res) => {
    try {
        const restaurants = await superAdminService.getRestaurantsOverview();
        res.json(restaurants || []);
    } catch (err: any) {
        console.error('[SUPER ADMIN] GET /restaurants error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;