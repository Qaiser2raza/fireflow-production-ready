// src/api/middleware/platformAuthMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { platformAuthService, PlatformUser } from '../services/platform/PlatformAuthService';

declare global {
  namespace Express {
    interface Request {
      platformUser?: PlatformUser;
    }
  }
}

export async function platformAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Missing platform authorization',
        detail: 'Expected: Authorization: Bearer <supabase-access-token>'
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({
        error: 'Invalid platform authorization header',
        detail: 'Bearer token is empty'
      });
      return;
    }

    const result = await platformAuthService.verifyAccessToken(token);

    if (!result.valid || !result.user) {
      res.status(401).json({
        error: 'Invalid platform credentials',
        detail: result.error || 'Token verification failed'
      });
      return;
    }

    req.platformUser = result.user;

    console.log(
      `[PLATFORM_AUTH] ${req.method} ${req.path} - Platform User: ${result.user.id} (${result.user.role})`
    );

    next();
  } catch (error: any) {
    console.error('[PLATFORM_AUTH] Middleware error:', error.message);
    res.status(500).json({
      error: 'Platform authentication service error',
      detail: 'An unexpected error occurred during platform authentication'
    });
  }
}

export function requirePlatformRole(...allowedRoles: PlatformUser['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.platformUser) {
      res.status(401).json({ error: 'Not authenticated as platform user' });
      return;
    }

    if (!allowedRoles.includes(req.platformUser.role)) {
      console.warn(
        `[PLATFORM_AUTH] Unauthorized: Platform user ${req.platformUser.id} (role: ${req.platformUser.role}) ` +
        `attempted to access resource requiring: ${allowedRoles.join(', ')}`
      );
      res.status(403).json({
        error: 'Insufficient platform permissions',
        required_role: allowedRoles,
        current_role: req.platformUser.role
      });
      return;
    }

    next();
  };
}
