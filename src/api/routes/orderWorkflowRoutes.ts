/**
 * orderRoutes.ts
 *
 * API endpoints for FireFlow order workflow:
 * - POST /api/orders/:orderId/fire
 * - POST /api/orders/:orderId/recall/:fireBatchId
 * - PATCH /api/orders/:orderId/items/:itemId/status
 * - POST /api/orders/skip-approval
 *
 * This router is mounted on the authenticated API router, so `req.staffId`,
 * `req.restaurantId` and `req.role` come from the verified token.
 */

import { Router, Request, Response } from 'express';
import { orderWorkflowService, SKIP_APPROVAL_ROLES } from '../services/OrderWorkflowService';

import { ItemStatus, SkipReason, PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// In-memory guard: prevents concurrent duplicate fire calls for the same orderId
const firingInProgress = new Set<string>();

// Apply auth middleware to all routes


/**
 * POST /api/orders/:orderId/fire
 * Fire all DRAFT items to kitchen
 * 
 * Headers required:
 * - Authorization: Bearer <jwt>
 * - x-session-id: <sessionId>
 * - x-terminal-id: <terminalId>
 */
router.post(
  '/:orderId/fire',
  async (req: Request, res: Response) => {
    const { orderId } = req.params;
    try {
      const sessionId = req.headers['x-session-id'] as string;
      const terminalId = req.headers['x-terminal-id'] as string;
      const staffId = req.staffId;
      const restaurantId = req.restaurantId;
      const userRole = req.role || 'WAITER';

      if (!orderId || !staffId || !restaurantId) {
        return res.status(400).json({
          error: 'Missing required parameters',
          code: 'MISSING_PARAMS',
          details: { orderId, staffId, restaurantId }
        });
      }

      // ⚠️ Idempotency guard: prevent concurrent duplicate fire for the same order
      if (firingInProgress.has(orderId)) {
        return res.status(409).json({
          error: 'Order fire already in progress',
          code: 'FIRE_IN_PROGRESS'
        });
      }
      firingInProgress.add(orderId);

      const safeSessionId = sessionId || 'NO_SESSION';
      const safeTerminalId = terminalId || 'UNKNOWN_TERMINAL';

      const result = await orderWorkflowService.fireOrderToKitchen(
        orderId,
        restaurantId,
        staffId,
        safeSessionId,
        safeTerminalId,
        userRole
      );

      // 🔔 Broadcast full updated order to ALL connected terminals (KDS, POS, Logistics)
      // The fire route was missing this emit — causing KDS to be blind until re-login.
      const io = req.app.get('io');
      if (io) {
        const fullOrder = await prisma.orders.findUnique({
          where: { id: orderId },
          include: {
            order_items: { include: { menu_item_variants: true } },
            dine_in_orders: true,
            takeaway_orders: true,
            delivery_orders: true,
            reservation_orders: true
          }
        });
        if (fullOrder) {
          io.to(`restaurant:${restaurantId ?? req.restaurantId}`).emit('db_change', {
            table: 'orders',
            eventType: 'UPDATE',
            data: fullOrder
          });
        }
      }

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code
        });
      }
      console.error('[FIRE_ORDER] error:', error);
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    } finally {
      // Always release the lock so retries are possible after genuine errors
      firingInProgress.delete(orderId);
    }
  }
);

/**
 * POST /api/orders/:orderId/recall/:fireBatchId
 * Recall a batch within 60-second window
 * 
 * Headers required:
 * - Authorization: Bearer <jwt>
 * - x-session-id: <sessionId>
 * - x-terminal-id: <terminalId>
 */
router.post(
  '/:orderId/recall/:fireBatchId',
  async (req: Request, res: Response) => {
    try {
      const { orderId, fireBatchId } = req.params;
      const sessionId = req.headers['x-session-id'] as string;
      const staffId = req.staffId;
      const restaurantId = req.restaurantId;
      const userRole = req.role || 'WAITER';

      if (!orderId || !fireBatchId || !staffId || !restaurantId) {
        return res.status(400).json({
          error: 'Missing required parameters',
          code: 'MISSING_PARAMS'
        });
      }

      const safeSessionId = sessionId || 'NO_SESSION';

      const result = await orderWorkflowService.recallOrderBatch(
        orderId,
        fireBatchId,
        restaurantId,
        staffId,
        safeSessionId,
        userRole
      );

      // Broadcast recalled order to ALL views (KDS, POS, Floor)
      const io = req.app.get('io');
      if (io) {
        const fullOrder = await prisma.orders.findUnique({
          where: { id: orderId },
          include: {
            order_items: { include: { menu_item_variants: true } },
            dine_in_orders: true, takeaway_orders: true,
            delivery_orders: true, reservation_orders: true
          }
        });
        if (fullOrder) {
          io.to(`restaurant:${restaurantId ?? req.restaurantId}`).emit('db_change', {
            table: 'orders',
            eventType: 'UPDATE',
            data: fullOrder
          });
        }
      }

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code
        });
      }
      console.error('[RECALL_ORDER] error:', error);
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }
);

/**
 * PUT /api/orders/:orderId/items/:itemId/status
 * Update order item status with transition validation
 * 
 * Body:
 * {
 *   "newStatus": "PREPARING" | "DONE" | "SERVED" | "SKIPPED",
 *   "skipReason"?: "CUSTOMER_CANCELLED" | "WRONG_ITEM" | "OUT_OF_STOCK" | "COMP",
 *   "undoReason"?: "string (for DONE undo)"
 * }
 * 
 * Headers required:
 * - Authorization: Bearer <jwt>
 * - x-session-id: <sessionId>
 * - x-terminal-id: <terminalId>
 */
router.patch(
  '/:orderId/items/:itemId/status',
  async (req: Request, res: Response) => {
    try {
      const { orderId, itemId } = req.params;
      const { newStatus, skipReason, undoReason } = req.body;
      const sessionId = req.headers['x-session-id'] as string;
      const staffId = req.staffId;
      const restaurantId = req.restaurantId;
      const userRole = req.role || 'CHEF';

      console.log('[ITEM_STATUS_DEBUG]', {
        staffId: req.staffId,
        restaurantId: req.restaurantId,
        orderId: req.params.orderId,
        itemId: req.params.itemId,
        newStatus: req.body.newStatus
      });

      if (!orderId || !itemId || !newStatus || !staffId || !restaurantId) {
        return res.status(400).json({
          error: 'Missing required parameters',
          code: 'MISSING_PARAMS'
        });
      }

      // Validate newStatus is valid ItemStatus
      const validStatuses = ['DRAFT', 'PENDING', 'PREPARING', 'DONE', 'SERVED', 'SKIPPED'];
      if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({
          error: 'Invalid status',
          code: 'INVALID_STATUS',
          details: { provided: newStatus, valid: validStatuses }
        });
      }

      const result = await orderWorkflowService.updateOrderItemStatus(
        orderId,
        itemId,
        newStatus as ItemStatus,
        restaurantId,
        staffId,
        sessionId || undefined,
        userRole,
        skipReason as SkipReason | undefined,
        undoReason
      );

      // Broadcast updated order so ALL views (KDS, POS, Floor) get the new item status
      const io = req.app.get('io');
      if (io) {
        const fullOrder = await prisma.orders.findUnique({
          where: { id: orderId },
          include: {
            order_items: { include: { menu_item_variants: true } },
            dine_in_orders: true, takeaway_orders: true, delivery_orders: true, reservation_orders: true
          }
        });
        if (fullOrder) {
          io.to(`restaurant:${restaurantId ?? req.restaurantId}`).emit('db_change', {
            table: 'orders',
            eventType: 'UPDATE',
            data: fullOrder
          });
        }
      }

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.log('[ITEM_STATUS_ERROR]', {
        message: error?.message,
        code: error?.code,
        statusCode: error?.statusCode,
        currentStatus: error?.currentStatus
      });

      if (error.statusCode) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code
        });
      }
      console.error('[UPDATE_ITEM_STATUS] error:', error);
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }
);

/**
 * POST /api/orders/skip-approval
 * Manager approval for skip operations (Task 04b).
 *
 * Body:
 * {
 *   "orderItemId": "uuid",
 *   "approvalAction": "APPROVE_SKIP" | "DENY_SKIP",
 *   "managerPin": "123456",     // the APPROVER'S OWN pin — required
 *   "reason": "Manager notes"
 * }
 *
 * Auth: Authorization Bearer (MANAGER | ADMIN | SUPER_ADMIN) + own manager PIN.
 * `x-session-id` is an attribution reference only: it is never an authentication
 * factor, and the service proves it is a cashier session of the caller's own
 * restaurant before writing it into `approval_logs.approved_by_session_id`.
 */
router.post(
  '/skip-approval',
  async (req: Request, res: Response) => {
    try {
      const { orderItemId, approvalAction, reason, managerPin } = req.body;
      const sessionId = req.headers['x-session-id'] as string;
      const managerId = req.staffId;
      const restaurantId = req.restaurantId;

      // Role gate is server-side (from the verified token), never from the body.
      if (!SKIP_APPROVAL_ROLES.includes((req.role || '').toUpperCase() as any)) {
        return res.status(403).json({
          error: 'Manager permission required',
          code: 'INSUFFICIENT_PERMISSION'
        });
      }

      if (!orderItemId || !approvalAction || !sessionId || !managerId || !restaurantId) {
        return res.status(400).json({
          error: 'Missing required parameters',
          code: 'MISSING_PARAMS'
        });
      }

      // x-session-id is attribution, never an authentication factor. A non-UUID
      // value can never resolve to a cashier_sessions row, so it is rejected here
      // rather than surfacing as a foreign-key violation.
      if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(sessionId)) {
        return res.status(400).json({
          error: 'Invalid session reference',
          code: 'INVALID_SESSION_REFERENCE'
        });
      }

      if (!['APPROVE_SKIP', 'DENY_SKIP'].includes(approvalAction)) {
        return res.status(400).json({
          error: 'Invalid approval action',
          code: 'INVALID_APPROVAL_ACTION'
        });
      }

      const result = await orderWorkflowService.approveSkipOrVoid(
        orderItemId,
        approvalAction as 'APPROVE_SKIP' | 'DENY_SKIP',
        managerId,
        sessionId,
        reason || 'No reason provided',
        restaurantId,
        managerPin
      );

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code
        });
      }
      console.error('[APPROVE_SKIP] error:', error);
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }
);

export default router;
