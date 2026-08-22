// src/api/middleware/platformAuthMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { platformJwtService } from '../services/platform/PlatformJwtService';
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
      res.status(401).json({ error: 'Invalid platform credentials' });
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({ error: 'Invalid platform credentials' });
      return;
    }

    let platformUser: PlatformUser | null = null;

    const fireflowResult = platformJwtService.verifyToken(token);
    if (fireflowResult.valid && fireflowResult.payload) {
      const sessionUser = await platformAuthService.validateSession(fireflowResult.payload.jti);
      if (sessionUser) {
        platformUser = sessionUser;
      }
    }

    if (!platformUser) {
      const supabaseVerified = await platformAuthService.verifySupabaseToken(token);
      if (supabaseVerified && supabaseVerified.sub) {
        const mappedUser = await platformAuthService.getUserBySupabaseId(supabaseVerified.sub);
        if (mappedUser) {
          platformUser = mappedUser;
        }
      }
    }

    if (!platformUser) {
      res.status(401).json({ error: 'Invalid platform credentials' });
      return;
    }

    req.platformUser = platformUser;

    console.log(
      `[PLATFORM_AUTH] ${req.method} ${req.path} - Platform User: ${platformUser.id} (${platformUser.role})`
    );

    next();
  } catch (error: any) {
    console.error('[PLATFORM_AUTH] Middleware error:', error.message);
    res.status(500).json({ error: 'Platform authentication service error' });
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
        current_role: req.platformUser.role,
      });
      return;
    }

    next();
  };
}
