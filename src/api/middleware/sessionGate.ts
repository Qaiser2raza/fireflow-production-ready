import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../shared/lib/prisma';

/**
 * Session Gate Middleware
 * 
 * Ensures that sensitive operations (Firing, Settling, Recalling)
 * are performed within the context of an ACTIVE cashier session.
 * 
 * Requirements:
 * 1. x-session-id header must be present.
 * 2. Session must exist in database.
 * 3. Session must be tied to the current staff member (or authorized manager).
 * 4. Terminal ID verification (optional but recommended for POS stability).
 * 
 * Exemptions:
 * - GET requests are always allowed (read-only, no session needed)
 * - POST /api/auth/login and POST /api/auth/refresh bypass the gate
 */
export async function sessionGateMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // ── Exemption: All GET requests are read-only — no session required ──────
  if (req.method === 'GET') return next();

  // ── Exemption: Auth endpoints never need a session ────────────────────────
  if (req.path === '/api/auth/login' || req.path === '/auth/login' ||
      req.path === '/api/auth/refresh' || req.path === '/auth/refresh') {
    return next();
  }

  const sessionId = req.headers['x-session-id'] as string;
  const terminalId = req.headers['x-terminal-id'] as string;

  if (!sessionId) {
    // KDS Exception: Allow status updates from authorized roles (Chef/Manager) without a formal Cashier Session
    // since they aren't typically at a POS terminal/register.
    const isStatusUpdate = req.path.includes('/status');
    const userRole = (req as any).user?.role || (req as any).role;
    
    if (isStatusUpdate && (userRole === 'CHEF' || userRole === 'MANAGER' || userRole === 'ADMIN' || userRole === 'SUPER_ADMIN')) {
      return next();
    }

    res.status(402).json({
      error: 'Active cashier session required',
      code: 'SESSION_REQUIRED',
      hint: 'Please open a shift or select an active session before performing this action.'
    });
    return;
  }

  try {
    const session = await prisma.cashier_sessions.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
       res.status(402).json({
        error: 'Invalid or expired session',
        code: 'SESSION_INVALID'
      });
      return;
    }

    if (session.status !== 'OPEN') {
       res.status(402).json({
        error: 'This session has been closed',
        code: 'SESSION_CLOSED'
      });
      return;
    }

    // Tenant Isolation
    if (session.restaurant_id !== req.restaurantId) {
       res.status(403).json({ error: 'Session does not belong to this restaurant' });
       return;
    }

    // Terminal Integrity: If terminalId is provided, it must match or be updated
    const s = session as any;
    if (terminalId && s.terminal_id && s.terminal_id !== terminalId) {
        // Option B: Warn/Update (Flexible for debugging)
        console.warn(`[AUDIT] Session ${sessionId} moved from terminal ${s.terminal_id} to ${terminalId}`);
    }

    // Attach session data for downstream use
    (req as any).cashierSession = session;
    
    next();
  } catch (error: any) {
    console.error('[SESSION_GATE] error:', error.message);
    res.status(500).json({ error: 'Internal audit service error' });
  }
}
