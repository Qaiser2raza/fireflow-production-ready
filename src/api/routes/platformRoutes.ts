// src/api/routes/platformRoutes.ts
import { Router } from 'express';
import { platformAuthService } from '../services/platform/PlatformAuthService';
import { supportSessionService, ALLOWED_SCOPES } from '../services/support/SupportSessionService';
import { platformAuthMiddleware, requirePlatformRole } from '../middleware/platformAuthMiddleware';
import { supportSessionMiddleware, requireSupportScope } from '../middleware/supportSessionMiddleware';

const router = Router();

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
// PLATFORM LICENSES
// ==========================================

router.get('/licenses', requirePlatformRole('PLATFORM_OWNER', 'SUPPORT_ENGINEER', 'SUPPORT_AGENT'), async (req, res) => {
  try {
    const result = await platformAuthService.verifyAccessToken(
      req.headers.authorization?.split(' ')[1] || ''
    );
    
    res.json({
      platform: true,
      message: 'Platform license endpoint — implementation pending migration from superAdminRoutes',
      user: req.platformUser
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PLATFORM TENANTS
// ==========================================

router.get('/tenants', requirePlatformRole('PLATFORM_OWNER', 'SUPPORT_ENGINEER', 'SUPPORT_AGENT'), async (req, res) => {
  try {
    res.json({
      platform: true,
      message: 'Platform tenant list endpoint — implementation pending',
      user: req.platformUser
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tenants/:id', requirePlatformRole('PLATFORM_OWNER', 'SUPPORT_ENGINEER', 'SUPPORT_AGENT'), async (req, res) => {
  try {
    res.json({
      platform: true,
      message: 'Platform tenant detail endpoint — implementation pending',
      user: req.platformUser,
      tenantId: req.params.id
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PLATFORM AUDIT
// ==========================================

router.get('/audit', requirePlatformRole('PLATFORM_OWNER', 'SUPPORT_ENGINEER'), async (req, res) => {
  try {
    res.json({
      platform: true,
      message: 'Platform audit endpoint — implementation pending',
      user: req.platformUser
    });
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



