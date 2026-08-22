// src/api/routes/platformRoutes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { supportSessionService, ALLOWED_SCOPES } from '../services/support/SupportSessionService';
import { platformAuthMiddleware, requirePlatformRole } from '../middleware/platformAuthMiddleware';
import { supportSessionMiddleware } from '../middleware/supportSessionMiddleware';

const router = Router();
const prisma = new PrismaClient();

// All platform routes require platform authentication
router.use(platformAuthMiddleware);

// ==========================================
// PLATFORM HEALTH
// ==========================================

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    platform: true,
    user: req.platformUser ? { id: req.platformUser.id, role: req.platformUser.role } : null,
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// PLATFORM TENANTS
// ==========================================

router.get('/tenants', requirePlatformRole('PLATFORM_OWNER', 'SUPPORT_ENGINEER'), async (_req, res) => {
  try {
    const restaurants = await prisma.restaurants.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        address: true,
        currency: true,
        timezone: true,
        is_active: true,
        subscription_plan: true,
        subscription_status: true,
        subscription_expires_at: true,
        trial_ends_at: true,
        monthly_fee: true,
        tax_enabled: true,
        tax_rate: true,
        service_charge_enabled: true,
        service_charge_rate: true,
        fbr_enabled: true,
        fbr_ntn: true,
        fbr_pos_id: true,
        logo_url: true,
        created_at: true,
        updated_at: true,
        owner_id: true,
      },
      orderBy: { created_at: 'desc' },
    });

    res.json({ success: true, data: restaurants });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tenants/:id', requirePlatformRole('PLATFORM_OWNER', 'SUPPORT_ENGINEER', 'SUPPORT_AGENT'), async (req, res) => {
  try {
    const restaurant = await prisma.restaurants.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        address: true,
        currency: true,
        timezone: true,
        is_active: true,
        subscription_plan: true,
        subscription_status: true,
        subscription_expires_at: true,
        trial_ends_at: true,
        monthly_fee: true,
        tax_enabled: true,
        tax_rate: true,
        service_charge_enabled: true,
        service_charge_rate: true,
        fbr_enabled: true,
        fbr_ntn: true,
        fbr_pos_id: true,
        logo_url: true,
        created_at: true,
        updated_at: true,
        owner_id: true,
        staff: { select: { id: true, name: true, role: true, status: true, created_at: true } },
      },
    });

    if (!restaurant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json({ success: true, data: restaurant });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/tenants/:id/suspend', requirePlatformRole('PLATFORM_OWNER'), async (req, res) => {
  try {
    const { reason } = req.body;
    const restaurant = await prisma.restaurants.update({
      where: { id: req.params.id },
      data: { is_active: false, updated_at: new Date() },
    });

    await prisma.audit_logs.create({
      data: {
        restaurant_id: restaurant.id,
        platform_actor_id: req.platformUser!.id,
        action_type: 'TENANT_SUSPENDED',
        entity_type: 'RESTAURANT',
        entity_id: restaurant.id,
        details: { reason, previous_status: 'active', new_status: 'suspended' },
        from_state: 'active',
        to_state: 'suspended',
      },
    });

    res.json({ success: true, data: restaurant });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/tenants/:id/activate', requirePlatformRole('PLATFORM_OWNER'), async (req, res) => {
  try {
    const restaurant = await prisma.restaurants.update({
      where: { id: req.params.id },
      data: { is_active: true, updated_at: new Date() },
    });

    await prisma.audit_logs.create({
      data: {
        restaurant_id: restaurant.id,
        platform_actor_id: req.platformUser!.id,
        action_type: 'TENANT_ACTIVATED',
        entity_type: 'RESTAURANT',
        entity_id: restaurant.id,
        details: { previous_status: 'suspended', new_status: 'active' },
        from_state: 'suspended',
        to_state: 'active',
      },
    });

    res.json({ success: true, data: restaurant });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/tenants/:id/plan', requirePlatformRole('PLATFORM_OWNER'), async (req, res) => {
  try {
    const { subscription_plan, subscription_expires_at } = req.body;
    const restaurant = await prisma.restaurants.update({
      where: { id: req.params.id },
      data: {
        subscription_plan,
        subscription_expires_at: subscription_expires_at ? new Date(subscription_expires_at) : undefined,
        updated_at: new Date(),
      },
    });

    await prisma.audit_logs.create({
      data: {
        restaurant_id: restaurant.id,
        platform_actor_id: req.platformUser!.id,
        action_type: 'TENANT_PLAN_UPDATED',
        entity_type: 'RESTAURANT',
        entity_id: restaurant.id,
        details: { subscription_plan, subscription_expires_at },
      },
    });

    res.json({ success: true, data: restaurant });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PLATFORM LICENSES
// ==========================================

router.get('/licenses', requirePlatformRole('PLATFORM_OWNER', 'SUPPORT_ENGINEER', 'SUPPORT_AGENT'), async (_req, res) => {
  try {
    const licenses = await prisma.license_keys.findMany({
      include: {
        restaurants: {
          select: { id: true, name: true, subscription_status: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    res.json({ success: true, data: licenses });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/licenses/generate', requirePlatformRole('PLATFORM_OWNER', 'SUPPORT_ENGINEER'), async (req, res) => {
  try {
    const { plan, restaurant_id, restaurant_name, hardware_fingerprint } = req.body;

    if (!plan || !['BASIC', 'STANDARD', 'PREMIUM', 'ENTERPRISE'].includes(plan)) {
      return res.status(400).json({ error: 'Valid plan is required' });
    }

    const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const generateBlock = (): string => {
      let block = '';
      for (let i = 0; i < 4; i++) {
        block += SAFE_CHARS.charAt(Math.floor(Math.random() * SAFE_CHARS.length));
      }
      return block;
    };

    const key = `FIRE-${generateBlock()}-${generateBlock()}-${generateBlock()}`;

    const license = await prisma.license_keys.create({
      data: {
        license_key: key,
        license_type: plan,
        restaurant_id: restaurant_id || null,
      },
    });

    await prisma.audit_logs.create({
      data: {
        restaurant_id: restaurant_id || null,
        platform_actor_id: req.platformUser!.id,
        action_type: 'LICENSE_GENERATED',
        entity_type: 'LICENSE_KEY',
        entity_id: license.id,
        details: { plan, restaurant_id, restaurant_name, hardware_fingerprint },
      },
    });

    res.status(201).json({ success: true, data: license });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PLATFORM AUDIT
// ==========================================

router.get('/audit', requirePlatformRole('PLATFORM_OWNER', 'SUPPORT_ENGINEER'), async (req, res) => {
  try {
    const { restaurant_id, action_type, limit = '100' } = req.query;

    const where: any = {};
    if (restaurant_id) where.restaurant_id = restaurant_id as string;
    if (action_type) where.action_type = action_type as string;

    const logs = await prisma.audit_logs.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: parseInt(limit as string),
    });

    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SUPPORT SESSIONS
// ==========================================

router.post('/support/sessions', requirePlatformRole('PLATFORM_OWNER', 'SUPPORT_ENGINEER', 'SUPPORT_AGENT'), async (req, res) => {
  try {
    const { restaurant_id, scope, reason } = req.body;

    if (!restaurant_id || !scope || !Array.isArray(scope) || scope.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        detail: 'restaurant_id and scope (non-empty array) are required'
      });
    }

    const validScopes = (scope as string[]).filter(s => ALLOWED_SCOPES.includes(s as any));
    if (validScopes.length === 0) {
      return res.status(400).json({
        error: 'Invalid scope',
        detail: 'Scope must contain at least one valid value',
        allowed: ALLOWED_SCOPES
      });
    }

    const session = await supportSessionService.createSession({
      restaurant_id,
      scope: validScopes as any,
      reason,
      created_by: req.platformUser!.id,
    });

    res.json({
      success: true,
      session: {
        id: session.id,
        restaurant_id: session.restaurant_id,
        scope: session.scope,
        reason: session.reason,
        created_at: session.created_at,
        expires_at: session.expires_at,
        status: session.status,
        platform_user: {
          id: req.platformUser!.id,
          role: req.platformUser!.role,
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/support/sessions/:id', requirePlatformRole('PLATFORM_OWNER', 'SUPPORT_ENGINEER', 'SUPPORT_AGENT'), async (req, res) => {
  try {
    const session = await supportSessionService.getSessionRaw(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Support session not found' });
    }
    res.json({
      success: true,
      session: {
        id: session.id,
        restaurant_id: session.restaurant_id,
        scope: session.scope,
        reason: session.reason,
        created_at: session.created_at,
        expires_at: session.expires_at,
        status: session.status,
        platform_user: {
          id: session.platform_user_id,
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/support/sessions/:id/revoke', requirePlatformRole('PLATFORM_OWNER', 'SUPPORT_ENGINEER', 'SUPPORT_AGENT'), supportSessionMiddleware, async (req, res) => {
  try {
    const session = await supportSessionService.revokeSession(req.params.id, req.platformUser!.id);
    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        revoked_at: session.revoked_at,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;



