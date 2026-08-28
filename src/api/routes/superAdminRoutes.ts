/**
 * Super Admin Routes
 * Handles SaaS management endpoints: licenses, payments, restaurants overview
 * License keys and payments are stored in Supabase cloud (not local Prisma).
 */

import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { superAdminService } from '../services/SuperAdminService';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { prisma } from '../../shared/lib/prisma';

const router = Router();

// All super-admin routes require authentication + SUPER_ADMIN role
router.use(authMiddleware);
router.use(requireRole('SUPER_ADMIN'));

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

// ==========================================
// RESTAURANT PROVISIONING (Phase 1 — SUPER_ADMIN only, D-4)
// ==========================================

/**
 * POST /api/super-admin/restaurants/provision
 * Vault "Create Restaurant": local tenant + manager inside one PG transaction;
 * cloud registration + owner invitation are enqueued as outbox events and
 * performed asynchronously by the dispatcher (never inside the transaction).
 *
 * The plaintext PIN is returned EXACTLY ONCE in this 201 response for the
 * printable handover sheet. It is stored nowhere and can never be re-fetched.
 */
router.post('/restaurants/provision', requireRole('SUPER_ADMIN'), async (req, res) => {
    try {
        const { name, slug, phone, address, city,
                subscription_plan: subscriptionPlan, subscription_status: subscriptionStatus,
                owner_name: ownerName, owner_email: ownerEmail, owner_phone: ownerPhone } = req.body;

        if (!name || !ownerName || !ownerEmail) {
            return res.status(400).json({ error: 'name, owner_name and owner_email are required' });
        }
        if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
            return res.status(400).json({ error: 'slug must be lowercase letters/digits separated by single hyphens' });
        }

        const { restaurantProvisioningService } = await import('../services/onboarding/RestaurantProvisioningService');
        const result = await restaurantProvisioningService.provisionRestaurant({
            name, slug, phone, address, city,
            subscriptionPlan, subscriptionStatus,
            ownerName, ownerEmail, ownerPhone,
            actorId: req.staffId ? String(req.staffId) : 'SYSTEM',
        });

        if (!result.success) {
            return res.status(400).json({ error: result.error || 'Provisioning failed' });
        }

        res.status(201).json({
            restaurant: result.restaurant,
            ownerStaff: {
                id: result.ownerStaff.id,
                name: result.ownerStaff.name,
                role: result.ownerStaff.role,
                must_change_pin: true,
                pin_expires_at: result.ownerStaff.pin_expires_at,
                // One-time secret for the handover sheet:
                temporary_pin: result.ownerStaff.temporary_pin,
            },
            owner_invite_id: result.ownerInviteId,
        });
    } catch (err: any) {
        console.error('[SUPER ADMIN] POST /restaurants/provision error:', err.message);
        res.status(500).json({ error: 'Provisioning service failure' });
    }
});

// ==========================================
// OWNER INVITES (Phase 1 slice B — SUPER_ADMIN only)
// ==========================================

/**
 * GET /api/super-admin/owner-invites
 * Latest invite state per provisioned restaurant (Vault badge feed).
 * Contains state/error-codes only — never secrets.
 */
router.get('/owner-invites', requireRole('SUPER_ADMIN'), async (_req, res) => {
    try {
        const rows = await prisma.owner_invites.findMany({
            orderBy: { updated_at: 'desc' },
            take: 200,
            include: { restaurants: { select: { name: true } } },
        });
        res.json(rows.map(r => ({
            invite_id: r.id,
            restaurant_id: r.restaurant_id,
            restaurant_name: r.restaurants?.name || null,
            email: r.email,
            state: r.state,
            attempt_count: r.attempt_count,
            last_error: r.last_error,
            invited_at: r.invited_at,
            updated_at: r.updated_at,
        })));
    } catch (err: any) {
        console.error('[SUPER ADMIN] GET /owner-invites error:', err.message);
        res.status(500).json({ error: 'Failed to load invites' });
    }
});

/**
 * POST /api/super-admin/owner-invites/:id/retry
 * Manual recovery: reset a failed/unknown invite to PENDING for the
 * dispatcher's next sweep. Never re-emits any secret.
 */
router.post('/owner-invites/:id/retry', requireRole('SUPER_ADMIN'), async (req, res) => {
    try {
        const { ownerInviteDispatcher } = await import('../services/onboarding/OwnerInviteDispatcher');
        const result = await ownerInviteDispatcher.manualRetry(req.params.id, 'vault-manual-retry');
        if (!result.ok) {
            return res.status(409).json({ error: result.error });
        }
        res.json({ success: true, state: result.state });
    } catch (err: any) {
        console.error('[SUPER ADMIN] POST /owner-invites/:id/retry error:', err.message);
        res.status(500).json({ error: 'Manual retry failed' });
    }
});

// ==========================================
// STAFF PIN RESET (Phase 2 — SUPER_ADMIN only)
// ==========================================

/**
 * POST /api/super-admin/staff/:id/reset-pin
 * Controlled recovery path for lost/expired manager PINs.
 * Issues a fresh CSPRNG one-time PIN (handover-once, same semantics as
 * provisioning), forces change on next login, expires in 7 days, resets
 * lockout counters, and revokes ALL refresh-token families for the staff
 * member. The plaintext PIN is returned exactly once and never stored,
 * logged, or re-emitted.
 */
router.post('/staff/:id/reset-pin', requireRole('SUPER_ADMIN'), async (req, res) => {
    try {
        const staff = await prisma.staff.findUnique({
            where: { id: req.params.id },
            select: { id: true, restaurant_id: true, name: true, status: true }
        });
        if (!staff) {
            return res.status(404).json({ error: 'Staff member not found' });
        }
        if (staff.status !== 'active') {
            return res.status(409).json({ error: 'Staff member is inactive; activate before resetting PIN' });
        }

        const temporaryPin = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
        const pinExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const pinHash = await bcrypt.hash(temporaryPin, 12);

        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.staff.update({
                where: { id: staff.id },
                data: {
                    pin: '',
                    hashed_pin: pinHash,
                    must_change_pin: true,
                    pin_expires_at: pinExpiresAt,
                    failed_login_count: 0,
                    locked_until: null
                }
            });

            // Revoke every live refresh token (all families) — old sessions die.
            await tx.refresh_tokens.updateMany({
                where: { staff_id: staff.id, revoked_at: null },
                data: { revoked_at: new Date() }
            });

            await tx.audit_logs.create({
                data: {
                    restaurant_id: staff.restaurant_id,
                    action_type: 'STAFF_PIN_RESET',
                    entity_type: 'STAFF',
                    entity_id: staff.id,
                    details: { target_name: staff.name, expires_at: pinExpiresAt.toISOString() },
                    performed_by_role: 'SUPER_ADMIN'
                }
            });

            return updated;
        });

        res.status(201).json({
            staff_id: result.id,
            name: result.name,
            must_change_pin: true,
            pin_expires_at: result.pin_expires_at,
            // One-time secret for the handover sheet:
            temporary_pin: temporaryPin
        });
    } catch (err: any) {
        console.error('[SUPER ADMIN] POST /staff/:id/reset-pin error:', err.message);
        res.status(500).json({ error: 'PIN reset failed' });
    }
});

export default router;