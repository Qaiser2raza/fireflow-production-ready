/**
 * OrderWorkflowService.ts
 * 
 * Core business logic for FireFlow order workflow:
 * - Atomic firing of items to kitchen
 * - 60-second recall window
 * - Status transitions with audit trails
 * - Manager approval for skip/void operations
 */

import { prisma } from '../../shared/lib/prisma';
import bcrypt from 'bcrypt';
import { 
  ItemStatus, 
  SkipReason 
} from '@prisma/client';

/** Task 04b: which staff may approve a skip, and with what credential. */
export const SKIP_APPROVAL_ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] as const;

/** Statuses an item may be in when a manager approves a skip. */
const SKIPPABLE_FROM: ItemStatus[] = ['DRAFT', 'PENDING', 'PREPARING', 'DONE', 'SERVED'];

/** Wrong manager PIN attempts before the account is locked out of approvals. */
const APPROVAL_PIN_MAX_ATTEMPTS = 5;
const APPROVAL_PIN_LOCK_MINUTES = 30;

export interface FireResult {
  fire_batch_id: string;
  items_fired: number;
  timestamp: string;
}

export interface RecallResult {
  recalled_count: number;
  batch_version: number;
  timestamp: string;
}

export interface StatusUpdateResult {
  status: ItemStatus;
  approval_required: boolean;
  timestamp: string;
}

export interface ApprovalResult {
  approved: boolean;
  timestamp: string;
}

export class OrderWorkflowService {
  /**
   * Fire all DRAFT items in an order to the kitchen
   * Atomic transaction: all items fire together or none
   */
  async fireOrderToKitchen(
    orderId: string,
    restaurantId: string,
    staffId: string,
    sessionId: string,
    terminalId: string,
    userRole: string
  ): Promise<FireResult> {
    return await prisma.$transaction(async (tx) => {
      // 1. Validate order exists and belongs to tenant
      const order = await tx.orders.findFirst({
        where: { id: orderId, restaurant_id: restaurantId },
        include: {
          restaurants: true,
          order_items: {
            where: { item_status: 'DRAFT' }
          }
        }
      });

      if (!order) {
        throw { statusCode: 404, code: 'ORDER_NOT_FOUND', message: 'Order not found' };
      }

      // 2. Check order is not closed
      if (order.status === 'CLOSED' || order.status === 'CANCELLED' || order.is_deleted) {
        throw { 
          statusCode: 400, 
          code: 'ORDER_CLOSED', 
          message: 'Cannot fire items on a closed order' 
        };
      }

      // 3. Check there are DRAFT items
      const draftItems = order.order_items;
      if (draftItems.length === 0) {
        throw { 
          statusCode: 400, 
          code: 'NO_DRAFT_ITEMS', 
          message: 'No items to fire' 
        };
      }

      // 5. Create fire_batch record (version = existing batches count + 1)
      const now = new Date();
      const existingBatchCount = await tx.fire_batches.count({
        where: { order_id: orderId }
      });
      const batch = await tx.fire_batches.create({
        data: {
          order_id: orderId,
          version_number: existingBatchCount + 1,
          created_by_user_id: staffId,
          created_at: now,
          metadata_json: {
            terminal_id: terminalId,
            fired_by_role: userRole,
            item_count: draftItems.length
          }
        }
      });

      // 6. Update all DRAFT items: set fired_at + fire_batch_id
      await tx.order_items.updateMany({
        where: {
          order_id: orderId,
          item_status: 'DRAFT'
        },
        data: {
          fired_at: now,
          fire_batch_id: batch.id,
          item_status: 'PENDING',
          status_updated_by: staffId,
          status_updated_at: now
        }
      });

      // 6b. Update overall order status to ACTIVE
      await tx.orders.update({
        where: { id: orderId },
        data: {
          status: 'ACTIVE',
          updated_at: now,
          last_action_at: now,
          last_action_desc: `Order fired (Batch v${batch.version_number})`
        }
      });

      // 7. Create audit log entry
      await tx.audit_logs.create({
        data: {
          restaurant_id: restaurantId,
          staff_id: staffId,
          action_type: 'FIRE',
          entity_type: 'order_items',
          entity_id: orderId,
          from_state: 'DRAFT',
          to_state: 'PENDING',
          session_id: sessionId,
          performed_by_role: userRole,
          details: {
            fire_batch_id: batch.id,
            items_count: draftItems.length,
            terminal_id: terminalId
          },
          created_at: now
        }
      });

      return {
        fire_batch_id: batch.id,
        items_fired: draftItems.length,
        timestamp: now.toISOString()
      };
    });
  }

  /**
   * Recall a batch within 60-second window
   * Only if no items have reached PREPARING status
   */
  async recallOrderBatch(
    orderId: string,
    fireBatchId: string,
    restaurantId: string,
    staffId: string,
    sessionId: string,
    userRole: string
  ): Promise<RecallResult> {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch original batch
      const originalBatch = await tx.fire_batches.findUnique({
        where: { id: fireBatchId },
        include: {
          order_items: true
        }
      });

      if (!originalBatch) {
        throw { 
          statusCode: 404, 
          code: 'BATCH_NOT_FOUND', 
          message: 'Fire batch not found' 
        };
      }

      // 2. Check tenant isolation
      if (originalBatch.order_id !== orderId) {
        throw { 
          statusCode: 403, 
          code: 'BATCH_ORDER_MISMATCH', 
          message: 'Batch does not belong to this order' 
        };
      }

      // 3. Check if any items reached PREPARING
      const advancedItems = originalBatch.order_items.filter(
        item => item.item_status === 'PREPARING' || 
                 item.item_status === 'DONE' || 
                 item.item_status === 'SERVED'
      );

      if (advancedItems.length > 0) {
        throw { 
          statusCode: 400, 
          code: 'ITEMS_ALREADY_PREPARING', 
          message: `Cannot recall — ${advancedItems.length} items already in kitchen` 
        };
      }

      // 4. Check 60-second recall window
      const windowEnd = new Date(originalBatch.created_at.getTime() + 60 * 1000);
      if (new Date() > windowEnd) {
        throw { 
          statusCode: 400, 
          code: 'RECALL_WINDOW_EXPIRED', 
          message: 'Recall window expired (60 seconds)' 
        };
      }

      // 5. Create new batch version (recall)
      const now = new Date();
      const newBatch = await tx.fire_batches.create({
        data: {
          order_id: orderId,
          version_number: originalBatch.version_number + 1,
          created_by_user_id: staffId,
          recalled_from_batch_id: fireBatchId,
          recalled_at: now,
          recalled_by: staffId,
          created_at: now,
          metadata_json: {
            reason: 'Manual recall by waiter',
            before_snapshot: originalBatch.order_items.map(item => ({
              item_id: item.id,
              status: item.item_status,
              started_at: item.started_at
            }))
          }
        }
      });

      // 6. Update items back to DRAFT
      await tx.order_items.updateMany({
        where: { fire_batch_id: fireBatchId },
        data: {
          item_status: 'DRAFT',
          fired_at: null,
          fire_batch_id: newBatch.id,
          status_updated_by: staffId,
          status_updated_at: now
        }
      });

      // 7. Create audit log
      await tx.audit_logs.create({
        data: {
          restaurant_id: restaurantId,
          staff_id: staffId,
          action_type: 'BATCH_RECALLED',
          entity_type: 'fire_batch',
          entity_id: fireBatchId,
          from_state: 'PENDING/PREPARING',
          to_state: 'DRAFT',
          session_id: sessionId,
          performed_by_role: userRole,
          details: {
            original_batch_id: fireBatchId,
            new_batch_version: newBatch.version_number,
            item_count: originalBatch.order_items.length
          },
          created_at: now
        }
      });

      return {
        recalled_count: originalBatch.order_items.length,
        batch_version: newBatch.version_number,
        timestamp: now.toISOString()
      };
    });
  }

  /**
   * Update order item status with transition validation
   * Returns approval_required flag if SERVED→SKIP transition
   */
  async updateOrderItemStatus(
    orderId: string,
    itemId: string,
    newStatus: ItemStatus,
    restaurantId: string,
    staffId: string,
    sessionId: string | undefined,
    userRole: string,
    skipReason?: SkipReason,
    undoReason?: string
  ): Promise<StatusUpdateResult> {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch item
      const item = await tx.order_items.findUnique({
        where: { id: itemId },
        include: {
          orders: true
        }
      });

      if (!item) {
        throw { 
          statusCode: 404, 
          code: 'ITEM_NOT_FOUND', 
          message: 'Order item not found' 
        };
      }

      // 2. Check order access
      if (item.order_id !== orderId || item.orders.restaurant_id !== restaurantId) {
        throw { 
          statusCode: 403, 
          code: 'ITEM_ACCESS_DENIED', 
          message: 'Cannot access this item' 
        };
      }

      // 3. Validate transition
      const validTransitions: Record<ItemStatus, ItemStatus[]> = {
        DRAFT: ['PENDING', 'SKIPPED'],
        PENDING: ['PREPARING', 'DONE', 'SKIPPED', 'DRAFT'],
        PREPARING: ['DONE', 'SKIPPED', 'PENDING'],
        DONE: ['SERVED', 'SKIPPED', 'DONE', 'PREPARING', 'PENDING'],  // DONE allows undo
        SERVED: ['SKIPPED', 'DONE'],
        SKIPPED: []  // No transitions from SKIPPED
      };

      const currentStatus = item.item_status as ItemStatus;
      const allowedTransitions = validTransitions[currentStatus] || [];

      if (!allowedTransitions.includes(newStatus)) {
        throw { 
          statusCode: 400, 
          code: 'INVALID_STATUS_TRANSITION', 
          message: `Cannot transition from ${currentStatus} to ${newStatus}` 
        };
      }

      // 4. Special case: DONE → DONE (undo)
      if (currentStatus === 'DONE' && newStatus === 'DONE') {
        // Check 30-second window
        const doneTime = item.completed_at;
        if (!doneTime) {
          throw { 
            statusCode: 400, 
            code: 'UNDO_NO_COMPLETION_TIME', 
            message: 'Cannot undo — no completion time recorded' 
          };
        }

        const windowEnd = new Date(doneTime.getTime() + 30 * 1000);
        if (new Date() > windowEnd) {
          throw { 
            statusCode: 400, 
            code: 'UNDO_WINDOW_EXPIRED', 
            message: 'Undo window expired (30 seconds)' 
          };
        }

        // Create undo audit log
        const now = new Date();
        await tx.audit_logs.create({
          data: {
            restaurant_id: restaurantId,
            staff_id: staffId,
            action_type: 'DONE_UNDO',
            entity_type: 'order_item',
            entity_id: itemId,
            from_state: 'DONE',
            to_state: 'PREPARING',
            session_id: sessionId || null,
            performed_by_role: userRole,
            details: {
              undo_reason: undoReason || 'Manual undo'
            },
            created_at: now
          }
        });

        return {
          status: 'PREPARING',
          approval_required: false,
          timestamp: now.toISOString()
        };
      }

      // 5. Handle SKIP transitions
      // Task 04b: an item becoming SKIPPED is approval-sensitive in EVERY state,
      // not only from SERVED. Otherwise a caller simply skips earlier in the
      // lifecycle and never reaches the approval gate. The status endpoint now
      // only reports that approval is required; the mutation happens exclusively
      // in approveSkipOrVoid (own-PIN, tenant-scoped, no self-approval).
      if (newStatus === 'SKIPPED') {
        if (!skipReason) {
          throw { 
            statusCode: 400, 
            code: 'SKIP_REASON_REQUIRED', 
            message: 'Skip reason is required' 
          };
        }

        return {
          status: currentStatus,
          approval_required: true,
          timestamp: new Date().toISOString()
        };
      }

      // 6. Update item
      const now = new Date();
      await tx.order_items.update({
        where: { id: itemId },
        data: {
          item_status: newStatus,
          status_updated_by: staffId,
          status_updated_at: now,
          // Task 04b: SKIPPED never reaches this update — it is handled by
          // approveSkipOrVoid, which records skip_reason itself.
          ...(newStatus === 'PREPARING' && { started_at: now }),
          ...(newStatus === 'DONE' && { completed_at: now }),
          ...(newStatus === 'SERVED' && { served_at: now })
        }
      });

      // 7. Create audit log
      await tx.audit_logs.create({
        data: {
          restaurant_id: restaurantId,
          staff_id: staffId,
          action_type: 'ITEM_STATUS_UPDATE',
          entity_type: 'order_item',
          entity_id: itemId,
          from_state: currentStatus,
          to_state: newStatus,
          session_id: sessionId || null,
          performed_by_role: userRole,
          details: {
            skip_reason: skipReason,
            undo_reason: undoReason
          },
          created_at: now
        }
      });

      // 8. Sync order status (e.g. mark READY if all items are done)
      await this.syncOrderStatus(orderId, tx);

      return {
        status: newStatus,
        approval_required: false,
        timestamp: now.toISOString()
      };
    });
  }

  /**
   * Manager approval for skip or void operations.
   *
   * Task 04b gates (all enforced here, so every caller is protected):
   *  - the approver re-authenticates with THEIR OWN manager PIN (tenant-bound
   *    staff lookup + bcrypt against hashed_pin; the plaintext `pin` column is
   *    never read), reusing the RefundService override pattern
   *  - the target order item must belong to the approver's restaurant
   *  - the approver may not be the person who last moved the item
   *    (self-approval). Comparison against the ORDER CREATOR is explicitly
   *    deferred: no creator identity is recorded on `orders` today.
   *  - a wrong PIN counts towards the existing staff lockout and is audited
   */
  async approveSkipOrVoid(
    orderItemId: string,
    approvalAction: 'APPROVE_SKIP' | 'DENY_SKIP',
    managerId: string,
    managerSessionId: string,
    reason: string,
    restaurantId: string,
    managerPin?: string
  ): Promise<ApprovalResult> {
    // 1. Authenticate the actor with their own PIN before anything is read.
    await this.verifyApprovalPin(managerId, restaurantId, managerPin);

    // 1b. The approver's session reference must resolve to a real cashier session
    //     of THIS restaurant. `approval_logs.approved_by_session_id` is a foreign
    //     key to `cashier_sessions.id`, so an unverified client header would either
    //     crash the insert (FK violation) or attribute the approval to another
    //     tenant's session. It stays non-authoritative: it never grants anything.
    await this.verifyApprovalSession(managerSessionId, restaurantId, managerId, orderItemId);

    try {
      return await prisma.$transaction(async (tx) => {
      // 2. Fetch item, then tenant-scope it explicitly so a cross-tenant id is
      //    rejected instead of silently mutating another restaurant's order.
      const item = await tx.order_items.findUnique({
        where: { id: orderItemId },
        include: { orders: true }
      });

      if (!item) {
        throw { 
          statusCode: 404, 
          code: 'ITEM_NOT_FOUND', 
          message: 'Order item not found' 
        };
      }

      if (item.orders.restaurant_id !== restaurantId) {
        throw this.denial(
          403,
          'CROSS_TENANT_APPROVAL',
          'Order item belongs to a different restaurant',
          'cross_tenant_target',
          {}
        );
      }

      const currentStatus = item.item_status as ItemStatus;

      // 3. Self-approval: the person who last moved the item cannot approve it.
      if (item.status_updated_by && item.status_updated_by === managerId) {
        throw this.denial(
          403,
          'SELF_APPROVAL_FORBIDDEN',
          'You cannot approve a skip on an item you last updated yourself',
          'self_approval',
          { from_state: currentStatus }
        );
      }

      // 4. Only skippable states may be approved.
      if (approvalAction === 'APPROVE_SKIP' && !SKIPPABLE_FROM.includes(currentStatus)) {
        throw this.denial(
          400,
          'INVALID_APPROVAL_ITEM',
          `Cannot skip an item in state ${currentStatus}`,
          'invalid_source_state',
          { from_state: currentStatus }
        );
      }

      const now = new Date();

      // 5. Handle approval
      if (approvalAction === 'APPROVE_SKIP') {
        // Update item to SKIPPED
        await tx.order_items.update({
          where: { id: orderItemId },
          data: {
            item_status: 'SKIPPED',
            skip_reason: 'COMP',  // Or could be from request
            status_updated_by: managerId,
            status_updated_at: now
          }
        });

        // Flag customer ledger if exists
        if (item.orders.customer_id) {
          await tx.customer_ledgers.findFirst({
            where: {
              order_id: item.order_id,
              customer_id: item.orders.customer_id
            }
          }).then(async (ledger) => {
            if (ledger) {
              await tx.customer_ledgers.update({
                where: { id: ledger.id },
                data: {
                  flagged_for_review: true,
                  flag_reason: `SKIP approved: ${reason}`
                }
              });
            }
          });
        }
      }

      // 4. Create approval log
      await tx.approval_logs.create({
        data: {
          restaurant_id: restaurantId,
          action_type: approvalAction,
          target_entity_type: 'order_item',
          target_entity_id: orderItemId,
          requested_by_user_id: item.status_updated_by || managerId,
          approved_by_user_id: managerId,
          approved_by_session_id: managerSessionId,
          reason: reason
        }
      });

      // 5. Create audit log
      await tx.audit_logs.create({
        data: {
          restaurant_id: restaurantId,
          staff_id: managerId,
          action_type: `MANAGER_${approvalAction}`,
          entity_type: 'order_item',
          entity_id: orderItemId,
          from_state: currentStatus,
          to_state: approvalAction === 'APPROVE_SKIP' ? 'SKIPPED' : currentStatus,
          session_id: managerSessionId,
          performed_by_role: 'MANAGER',
          details: { reason },
          created_at: now
        }
      });

      // 6. Sync order status
      await this.syncOrderStatus(item.order_id, tx);

      return {
        approved: approvalAction === 'APPROVE_SKIP',
        timestamp: now.toISOString()
      };
      });
    } catch (error: any) {
      // Denials must survive the rollback: writing the audit inside the aborted
      // transaction silently discarded every record of a refused approval.
      if (error?.audit?.reason) {
        await this.auditApprovalDenial(
          restaurantId,
          managerId,
          orderItemId,
          error.audit.reason,
          error.audit.details || {}
        );
      }
      throw error;
    }
  }

  /**
   * Build a denial error that carries its own audit payload.
   */
  private denial(
    statusCode: number,
    code: string,
    message: string,
    auditReason: string,
    details: Record<string, unknown> = {}
  ): any {
    return { statusCode, code, message, audit: { reason: auditReason, details } };
  }

  /** Refused skip approvals are never silent, even though the tx rolled back. */
  private async auditApprovalDenial(
    restaurantId: string,
    staffId: string,
    orderItemId: string,
    reason: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      await prisma.audit_logs.create({
        data: {
          restaurant_id: restaurantId,
          staff_id: staffId,
          action_type: 'SKIP_APPROVAL_DENIED',
          entity_type: 'order_item',
          entity_id: orderItemId,
          details: { reason, ...details },
          created_at: new Date(),
        },
      });
    } catch {
      // An audit write must never mask the denial that is being returned.
    }
  }

  /**
   * Task 04b: resolve the approver's session reference against real data.
   *
   * `approval_logs.approved_by_session_id` is a foreign key to
   * `cashier_sessions.id`, so a client-supplied `x-session-id` is untrusted input
   * that must be proven to be a session of THIS restaurant before it is persisted.
   * This is attribution integrity, not authentication: the JWT and the approver's
   * own PIN remain the only authorization factors.
   */
  private async verifyApprovalSession(
    sessionId: string,
    restaurantId: string,
    approverId: string,
    orderItemId: string
  ): Promise<void> {
    const invalid = async () => {
      await this.auditApprovalDenial(restaurantId, approverId, orderItemId, 'unknown_session_reference', {});
      return {
        statusCode: 400,
        code: 'INVALID_SESSION_REFERENCE',
        message: 'Approval session does not belong to this restaurant',
      };
    };

    if (typeof sessionId !== 'string' || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(sessionId)) {
      throw await invalid();
    }

    const session = await prisma.cashier_sessions.findFirst({
      where: { id: sessionId, restaurant_id: restaurantId },
      select: { id: true },
    });

    if (!session) {
      throw await invalid();
    }
  }

  /**
   * Task 04b: re-authenticate the approving actor with their OWN manager PIN.
   *
   * Deliberately mirrors the RefundService override pattern (staff loaded by
   * `{ id, restaurant_id }`, bcrypt against `hashed_pin`, plaintext `pin` never
   * read) instead of /api/auth/verify-pin, whose `requiredRole` comes from the
   * request body and whose candidate search would accept another manager's PIN.
   * Wrong PINs feed the existing staff lockout and are audited.
   */
  private async verifyApprovalPin(
    managerId: string,
    restaurantId: string,
    managerPin?: string
  ): Promise<void> {
    const invalid = (statusCode: number, code: string, message: string, details?: Record<string, unknown>) => ({
      statusCode,
      code,
      message,
      details,
    });

    if (typeof managerPin !== 'string' || !/^\d{6}$/.test(managerPin)) {
      await this.auditPinFailure(managerId, restaurantId, 'invalid_pin_format');
      throw invalid(401, 'APPROVAL_PIN_REQUIRED', 'A valid manager PIN is required for this approval');
    }

    const manager = await prisma.staff.findFirst({
      where: { id: managerId, restaurant_id: restaurantId },
      select: {
        id: true,
        status: true,
        hashed_pin: true,
        failed_login_count: true,
        locked_until: true,
      },
    });

    const now = new Date();

    if (!manager || !manager.hashed_pin || (manager.status || '').toLowerCase() !== 'active') {
      await this.auditPinFailure(managerId, restaurantId, 'approver_not_eligible');
      throw invalid(401, 'INVALID_APPROVER', 'Approver is not an active staff member of this restaurant');
    }

    if (manager.locked_until && manager.locked_until > now) {
      await this.auditPinFailure(managerId, restaurantId, 'approver_locked');
      throw invalid(423, 'APPROVER_LOCKED', 'Too many failed approval attempts. Try again later.');
    }

    const matches = await bcrypt.compare(managerPin, manager.hashed_pin);

    if (!matches) {
      const failedCount = (manager.failed_login_count || 0) + 1;
      const updateData: any = { failed_login_count: failedCount };

      if (failedCount >= APPROVAL_PIN_MAX_ATTEMPTS) {
        updateData.locked_until = new Date(now.getTime() + APPROVAL_PIN_LOCK_MINUTES * 60 * 1000);
      }

      await prisma.staff.update({ where: { id: manager.id }, data: updateData });
      await this.auditPinFailure(managerId, restaurantId, 'invalid_pin', {
        failed_count: failedCount,
        locked_until: updateData.locked_until ? updateData.locked_until.toISOString() : null,
      });

      throw invalid(401, 'INVALID_APPROVAL_PIN', 'Invalid manager PIN');
    }

    // Successful re-auth clears the counter, exactly like a normal PIN login.
    await prisma.staff.update({
      where: { id: manager.id },
      data: { failed_login_count: 0, locked_until: null },
    });
  }

  /** Failed approval-PIN attempts are never silent. */
  private async auditPinFailure(
    staffId: string,
    restaurantId: string,
    reason: string,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      await prisma.audit_logs.create({
        data: {
          restaurant_id: restaurantId,
          staff_id: staffId,
          action_type: 'APPROVAL_PIN_FAILED',
          entity_type: 'STAFF',
          entity_id: staffId,
          details: { reason, context: 'skip_approval', ...details },
          created_at: new Date(),
        },
      });
    } catch {
      // An audit write must never turn into a 500 that hides the auth failure.
    }
  }

  /**
   * Sync order status based on item statuses
   * - If all items are DONE/SERVED/SKIPPED -> set order to READY
   * - If any item is not finished and order was READY -> set back to ACTIVE
   */
  private async syncOrderStatus(orderId: string, tx: any): Promise<void> {
    const items = await tx.order_items.findMany({
      where: { order_id: orderId }
    });

    if (items.length === 0) return;

    const isAllFinished = items.every((i: any) => 
      ['DONE', 'SERVED', 'SKIPPED'].includes(i.item_status)
    );

    const order = await tx.orders.findUnique({
      where: { id: orderId }
    });

    if (!order) return;

    // Normalize to guard against DB whitespace/case artifacts
    const currentStatus = (order.status || '').trim().toUpperCase();
    const isEligibleForReady = ['ACTIVE', 'DRAFT'].includes(currentStatus);

    if (isAllFinished && isEligibleForReady) {
      await tx.orders.update({
        where: { id: orderId },
        data: { status: 'READY' }
      });
    } else if (!isAllFinished && currentStatus === 'READY') {
      // If items were undone or partially added, move back to ACTIVE
      await tx.orders.update({
        where: { id: orderId },
        data: { status: 'ACTIVE' }
      });
    }
  }
}

export const orderWorkflowService = new OrderWorkflowService();
