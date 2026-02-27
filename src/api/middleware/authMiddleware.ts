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
    // 1. Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeaderLocal(authHeader);

    if (!token) {
      res.status(401).json({
        error: 'Missing or invalid Authorization header',
        detail: 'Expected: Authorization: Bearer <token>'
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

    // 4. Attach to request context
    req.staffId = decoded.payload.staffId;
    req.restaurantId = decoded.payload.restaurantId;
    req.role = decoded.payload.role;
    req.staff = {
      id: decoded.payload.staffId,
      restaurantId: decoded.payload.restaurantId,
      role: decoded.payload.role,
      name: decoded.payload.name
    };

    // 5. Continue to next handler
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

    if (!allowedRoles.includes(req.role)) {
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
