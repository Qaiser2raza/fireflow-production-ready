// src/api/middleware/authMiddleware.ts
/**
 * Express Middleware for JWT Authentication
 * 
 * Responsibilities:
 * - Extract Bearer token from Authorization header
 * - Verify token signature and expiry
 * - Extract and validate claims (staffId, restaurantId)
 * - Attach claims to request for downstream handlers
 * - Return 401/403 on auth failures
 * 
 * Usage:
 * app.use('/api/protected', authMiddleware);  // Protect entire route group
 * OR
 * app.post('/api/route', authMiddleware, handler);  // Protect single route
 */

import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../services/auth/JwtService';
import { prisma } from '../../shared/lib/prisma';

// ==========================================
// TYPE EXTENSIONS
// ==========================================

/**
 * Extend Express Request to include authenticated user context
 * This is set by the middleware after successful JWT verification
 */
declare global {
  namespace Express {
    interface Request {
      staffId?: string;           // Authenticated staff ID
      restaurantId?: string;      // Authenticated restaurant ID (tenant)
      role?: string;              // Staff role (waiter, manager, super_admin)
      staff?: {
        id: string;
        restaurantId: string;
        role: string;
        name: string;
      };
      supportSession?: any;       // Active support session (set by supportSessionMiddleware)
    }
  }
}

// ==========================================
// MIDDLEWARE FUNCTION
// ==========================================

/**
 * Authentication middleware
 * 
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Verify token signature and expiry
 * 3. Validate claims (staffId, restaurantId)
 * 4. Attach to request.staffId, request.restaurantId, request.role
 * 5. Call next() or return 401/403
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // PUBLIC: QR menu & ordering endpoints — no auth required
    const originalUrl = req.originalUrl.split('?')[0];
    const isPublicMenuGet = req.method === 'GET' && (
      originalUrl.startsWith('/api/menu_categories') ||
      originalUrl.startsWith('/api/orders/qr-status')
    );
    const isPublicOrderPost = req.method === 'POST' && originalUrl.startsWith('/api/orders/qr');
    
    if (isPublicMenuGet || isPublicOrderPost) {
      next();
      return;
    }

    // 1. Extract token from Authorization header OR query param (for downloads)
    const authHeader = req.headers.authorization;
    let token = extractTokenFromHeaderLocal(authHeader);

    // Support window.open/downloads where headers aren't possible
    if (!token && req.query.token) {
      const queryToken = req.query.token as string;
      token = queryToken.trim(); // Harden: Remove whitespace/newlines
    }

    if (!token) {
      console.warn(`[AUTH] Missing credentials for ${req.method} ${req.path}`);
      res.status(401).json({
        error: 'Missing or invalid Authorization header',
        detail: 'Expected: Authorization: Bearer <token> OR URL parameter ?token=<token>',
        hint: 'If you are seeing this, ensure your request includes a valid JWT token.'
      });
      return;
    }

    // 2. Verify token
    const decoded = jwtService.verifyToken(token);

    if (!decoded.valid || !decoded.payload) {
      console.warn(`[AUTH] Token verification failed: ${decoded.error}`);

      // 410 Gone for expired tokens (client should refresh)
      const statusCode = decoded.error?.includes('expired') ? 410 : 401;

      res.status(statusCode).json({
        error: decoded.error || 'Token verification failed',
        code: statusCode === 410 ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
      });
      return;
    }

    // 3. Verify token type (should be 'access' for regular requests, not 'refresh')
    if (decoded.payload.type !== 'access') {
      console.warn(`[AUTH] Invalid token type: ${decoded.payload.type}`);
      res.status(401).json({
        error: 'Invalid token type. Use access token for API requests.',
        detail: 'Refresh tokens cannot be used for API requests. Use POST /api/auth/refresh to get a new access token.'
      });
      return;
    }

    // 4. Verify staff exists and is active
    const staffRecord = await prisma.staff.findFirst({
      where: {
        id: decoded.payload.staffId,
        restaurant_id: decoded.payload.restaurantId,
      },
      select: {
        id: true,
        status: true,
        restaurant_id: true,
        must_change_pin: true,
      },
    });

    if (!staffRecord) {
      res.status(401).json({
        error: 'Invalid credentials',
        code: 'STAFF_NOT_FOUND'
      });
      return;
    }

    if (staffRecord.status !== 'active') {
      res.status(403).json({
        error: 'Account is inactive',
        code: 'STAFF_INACTIVE'
      });
      return;
    }

    const restaurantRecord = await prisma.restaurants.findFirst({
      where: {
        id: decoded.payload.restaurantId,
      },
      select: {
        id: true,
        is_active: true,
        onboarding_status: true,
      },
    });

    if (!restaurantRecord || !restaurantRecord.is_active) {
      res.status(403).json({
        error: 'Restaurant is inactive',
        code: 'RESTAURANT_INACTIVE'
      });
      return;
    }

    // 5. Attach to request context
    req.staffId = decoded.payload.staffId;
    req.role = decoded.payload.role;
    req.staff = {
      id: decoded.payload.staffId,
      restaurantId: decoded.payload.restaurantId,
      role: decoded.payload.role,
      name: decoded.payload.name
    };

    // Support session bridge: if supportSessionMiddleware already set req.restaurantId,
    // do NOT override it with the tenant JWT's restaurantId.
    if (!req.restaurantId) {
      req.restaurantId = decoded.payload.restaurantId;
    }

    console.log(`[AUTH] ${req.method} ${req.path} - Staff: ${req.staffId} (${req.role}) @ Restaurant: ${req.restaurantId}`);

    // 6. SUPER_ADMIN: Allow targeting any restaurant via x-target-restaurant header
    // TRANSITIONAL: This mechanism is deprecated. Migrate to support sessions.
    // SUPPORT BRIDGE: If a support session is active, x-target-restaurant MUST NOT override it.
    if (req.role === 'SUPER_ADMIN' && !req.supportSession) {
      const targetRestaurant = req.headers['x-target-restaurant'] as string | undefined;
      if (targetRestaurant && targetRestaurant.length > 0) {
        req.restaurantId = targetRestaurant;
        try {
          await prisma.audit_logs.create({
            data: {
              restaurant_id: targetRestaurant,
              staff_id: req.staffId,
              action_type: 'SUPER_ADMIN_TARGET_RESTAURANT',
              entity_type: 'RESTAURANT',
              entity_id: targetRestaurant,
              details: {
                original_restaurant_id: decoded.payload.restaurantId,
                target_restaurant_id: targetRestaurant,
                path: req.originalUrl,
                method: req.method
              }
            }
          });
        } catch (auditError) {
          console.error('[AUTH] Audit log failed for x-target-restaurant:', auditError);
        }
      }
    }

    // 6.5 Phase 2 setup gate — server-authoritative, single choke point.
    // Two independent restrictions, evaluated against TRUSTED claims (the
    // actor's own tenant from the JWT, never x-target-restaurant):
    //   a) actor staff has must_change_pin → allowlist-only access
    //   b) own tenant onboarding_status = SETUP_INCOMPLETE → same
    // HQ/support contexts (SUPER_ADMIN role or an active support session)
    // bypass: they are the people who help tenants complete setup.
    const mustChangePin = staffRecord.must_change_pin === true;
    const setupIncomplete = restaurantRecord.onboarding_status === 'SETUP_INCOMPLETE';
    if ((mustChangePin || setupIncomplete) && req.role !== 'SUPER_ADMIN' && !req.supportSession) {
      const p = originalUrl;
      const setupAllowed =
        p.startsWith('/api/auth/refresh') ||
        p.startsWith('/api/auth/logout') ||
        p.startsWith('/api/auth/change-pin') ||
        p.startsWith('/api/onboarding') ||
        (req.method === 'GET' && /^\/api\/restaurants\/[0-9a-fA-F-]+\/profile$/.test(p));
      if (!setupAllowed) {
        res.status(403).json(
          mustChangePin
            ? { error: 'PIN change required before accessing restaurant operations', code: 'PIN_CHANGE_REQUIRED' }
            : { error: 'Restaurant setup is incomplete. Complete first-login setup to continue.', code: 'SETUP_INCOMPLETE' }
        );
        return;
      }
    }

    // 7. Continue to next handler
    next();

  } catch (error: any) {
    console.error('[AUTH] Middleware error:', error.message);
    res.status(500).json({
      error: 'Authentication service error',
      detail: 'An unexpected error occurred during authentication'
    });
  }
}

/**
 * Local helper to extract Bearer token
 * (avoids circular dependency with JwtService)
 */
function extractTokenFromHeaderLocal(authHeader?: string): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

// ==========================================
// OPTIONAL: ROLE-BASED MIDDLEWARE
// ==========================================

/**
 * Check if authenticated user has required role
 * Usage: app.post('/api/admin', authMiddleware, requireRole('manager'), handler);
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.role) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const userRoleUpper = req.role.toUpperCase();
    const allowedRolesUpper = allowedRoles.map(r => r.toUpperCase());

    if (!allowedRolesUpper.includes(userRoleUpper)) {
      console.warn(
        `[AUTH] Unauthorized: Staff ${req.staffId} (role: ${req.role}) ` +
        `attempted to access resource requiring: ${allowedRoles.join(', ')}`
      );
      res.status(403).json({
        error: 'Insufficient permissions',
        required_role: allowedRoles,
        current_role: req.role
      });
      return;
    }

    next();
  };
}

/**
 * Check if authenticated user belongs to restaurant
 * Usage: app.post('/api/restaurant/:id', authMiddleware, belongsToRestaurant(), handler);
 */
export function belongsToRestaurant() {
  return (req: Request, res: Response, next: NextFunction) => {
    const { restaurantId } = req.params;

    if (!req.restaurantId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (req.restaurantId !== restaurantId) {
      console.warn(
        `[AUTH] Unauthorized: Staff ${req.staffId} (restaurant: ${req.restaurantId}) ` +
        `attempted to access different restaurant: ${restaurantId}`
      );
      res.status(403).json({
        error: 'Access denied: You do not belong to this restaurant',
        your_restaurant: req.restaurantId,
        requested_restaurant: restaurantId
      });
      return;
    }

    next();
  };
}
