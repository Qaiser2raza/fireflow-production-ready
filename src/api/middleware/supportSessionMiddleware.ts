// src/api/middleware/supportSessionMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { supportSessionService } from '../services/support/SupportSessionService';

declare global {
  namespace Express {
    interface Request {
      // Typed loosely to stay compatible with the augmentation in authMiddleware.
      supportSession?: any;
      supportScopes?: readonly string[];
    }
  }
}

export async function supportSessionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = req.params.sessionId || req.headers['x-support-session'] as string | undefined;

    if (!sessionId) {
      res.status(401).json({
        error: 'Support session required',
        detail: 'Provide session ID via path param or x-support-session header'
      });
      return;
    }

    const session = await supportSessionService.getSession(sessionId);

    if (!session) {
      res.status(401).json({
        error: 'Invalid or expired support session',
        code: 'SUPPORT_SESSION_INVALID'
      });
      return;
    }

    req.supportSession = session;
    req.supportScopes = session.scope;
    req.restaurantId = session.restaurant_id;

    next();
  } catch (error: any) {
    console.error('[SUPPORT_SESSION] Middleware error:', error.message);
    res.status(500).json({
      error: 'Support session validation failed',
      detail: 'An unexpected error occurred during support session validation'
    });
  }
}

export function requireSupportScope(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.supportScopes) {
      res.status(403).json({
        error: 'Support session required',
        detail: 'No support session or scope attached'
      });
      return;
    }

    const sessionScopes = req.supportScopes as readonly string[];
    const missing = requiredScopes.filter(s => !sessionScopes.includes(s));

    if (missing.length > 0) {
      res.status(403).json({
        error: 'Insufficient support scope',
        required: requiredScopes,
        granted: sessionScopes,
        missing
      });
      return;
    }

    next();
  };
}
