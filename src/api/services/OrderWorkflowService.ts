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
import { 
  ItemStatus, 
  SkipReason 
} from '@prisma/client';

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
      // 1. Validate order exists
      const order = await tx.orders.findUnique({
        where: { id: orderId },
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

      // 3. Check tenant isolation
      if (order.restaurant_id !== restaurantId) {
        throw { 
          statusCode: 403, 
          code: 'TENANT_MISMATCH', 
          message: 'Order does not belong to this restaurant' 
        };
      }

      // 4. Check there are DRAFT items
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
      if (newStatus === 'SKIPPED') {
        if (!skipReason) {
          throw { 
            statusCode: 400, 
            code: 'SKIP_REASON_REQUIRED', 
            message: 'Skip reason is required' 
          };
        }

        // Special: SERVED→SKIP requires manager approval
        if (currentStatus === 'SERVED') {
          return {
            status: 'SERVED',
            approval_required: true,
            timestamp: new Date().toISOString()
          };
        }
      }

      // 6. Update item
      const now = new Date();
      await tx.order_items.update({
        where: { id: itemId },
        data: {
          item_status: newStatus,
          status_updated_by: staffId,
          status_updated_at: now,
          ...(newStatus === 'SKIPPED' && { skip_reason: skipReason }),
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
   * Manager approval for skip or void operations
   */
  async approveSkipOrVoid(
    orderItemId: string,
    approvalAction: 'APPROVE_SKIP' | 'DENY_SKIP',
    managerId: string,
    managerSessionId: string,
    reason: string,
    restaurantId: string
  ): Promise<ApprovalResult> {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch item
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

      // 2. Check item is SERVED (approval only for SERVED→SKIP)
      if (item.item_status !== 'SERVED') {
        throw { 
          statusCode: 400, 
          code: 'INVALID_APPROVAL_ITEM', 
          message: 'Approval only valid for SERVED items' 
        };
      }

      const now = new Date();

      // 3. Handle approval
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
          from_state: 'SERVED',
          to_state: approvalAction === 'APPROVE_SKIP' ? 'SKIPPED' : 'SERVED',
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
    const isBlockedStatus = ['READY', 'DELIVERED', 'CLOSED', 'CANCELLED'].includes(currentStatus);

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
