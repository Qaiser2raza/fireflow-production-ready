/**
 * useOrderWorkflow.ts (KDS)
 *
 * React hook for order workflow API calls from the Kitchen Display System.
 * Provides fire, recall, updateItemStatus, and approveSkip actions.
 */

import { useState, useCallback } from 'react';
import { ItemStatus, SkipReason } from '@prisma/client';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

// ─── Response Types ──────────────────────────────────────────────────────────

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOrderWorkflow() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fire all DRAFT items in an order to the kitchen.
   */
  const fire = useCallback(
    async (
      orderId: string,
      sessionId: string,
      terminalId: string
    ): Promise<FireResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithAuth(`/api/orders/${orderId}/fire`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId,
            'x-terminal-id': terminalId,
          },
        });
        const body = await res.json();
        if (!res.ok) {
          setError(body.error || `Fire failed (${res.status})`);
          return null;
        }
        return body.data as FireResult;
      } catch (err: any) {
        setError(err.message || 'Network error');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Recall a batch within the 60-second window.
   */
  const recall = useCallback(
    async (
      orderId: string,
      fireBatchId: string,
      sessionId: string,
      terminalId: string
    ): Promise<RecallResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithAuth(`/api/orders/${orderId}/recall/${fireBatchId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId,
            'x-terminal-id': terminalId,
          },
        });
        const body = await res.json();
        if (!res.ok) {
          setError(body.error || `Recall failed (${res.status})`);
          return null;
        }
        return body.data as RecallResult;
      } catch (err: any) {
        setError(err.message || 'Network error');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Update an order item's status (PENDING → PREPARING → DONE → SERVED → SKIPPED).
   */
  const updateItemStatus = useCallback(
    async (
      orderId: string,
      itemId: string,
      newStatus: ItemStatus,
      sessionId: string,
      terminalId: string,
      skipReason?: SkipReason,
      undoReason?: string
    ): Promise<StatusUpdateResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithAuth(`/api/orders/${orderId}/items/${itemId}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId,
            'x-terminal-id': terminalId,
          },
          body: JSON.stringify({ newStatus, skipReason, undoReason }),
        });
        const body = await res.json();
        if (!res.ok) {
          setError(body.error || `Status update failed (${res.status})`);
          return null;
        }
        return body.data as StatusUpdateResult;
      } catch (err: any) {
        setError(err.message || 'Network error');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Manager approval/denial for a skip request on a SERVED item.
   */
  const approveSkip = useCallback(
    async (
      orderItemId: string,
      approvalAction: 'APPROVE_SKIP' | 'DENY_SKIP',
      reason: string,
      sessionId: string,
      terminalId: string
    ): Promise<ApprovalResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithAuth('/api/orders/skip-approval', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId,
            'x-terminal-id': terminalId,
          },
          body: JSON.stringify({ orderItemId, approvalAction, reason }),
        });
        const body = await res.json();
        if (!res.ok) {
          setError(body.error || `Approval failed (${res.status})`);
          return null;
        }
        return body.data as ApprovalResult;
      } catch (err: any) {
        setError(err.message || 'Network error');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { fire, recall, updateItemStatus, approveSkip, loading, error };
}
