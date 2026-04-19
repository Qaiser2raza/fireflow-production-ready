/**
 * useOrderWorkflow.ts
 * 
 * Custom hooks for FireFlow order workflow API calls
 * Handles fire, recall, status updates, and manager approvals
 */

import { useState, useCallback } from 'react';
import { ItemStatus, SkipReason } from '@prisma/client';

const API_URL = 'http://localhost:3001/api';

interface UseOrderWorkflowReturn {
  loading: boolean;
  error: string | null;
  fire: (orderId: string, sessionId: string, terminalId: string) => Promise<{
    fire_batch_id: string;
    items_fired: number;
    timestamp: string;
  } | null>;
  recall: (orderId: string, fireBatchId: string, sessionId: string, terminalId: string) => Promise<{
    recalled_count: number;
    batch_version: number;
    timestamp: string;
  } | null>;
  updateItemStatus: (
    orderId: string,
    itemId: string,
    newStatus: ItemStatus,
    sessionId: string,
    terminalId: string,
    skipReason?: SkipReason,
    undoReason?: string
  ) => Promise<{
    status: ItemStatus;
    approval_required: boolean;
    timestamp: string;
  } | null>;
  approveSkip: (
    orderItemId: string,
    approvalAction: 'APPROVE_SKIP' | 'DENY_SKIP',
    reason: string,
    sessionId: string,
    terminalId: string
  ) => Promise<{
    approved: boolean;
    timestamp: string;
  } | null>;
}

/**
 * Hook for order workflow operations
 */
export const useOrderWorkflow = (): UseOrderWorkflowReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getHeaders = () => {
    const accessToken = sessionStorage.getItem('accessToken');
    return {
      'Content-Type': 'application/json',
      ...(accessToken && { Authorization: `Bearer ${accessToken}` })
    };
  };

  const fire = useCallback(
    async (orderId: string, sessionId: string, terminalId: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/orders/${orderId}/fire`, {
          method: 'POST',
          headers: {
            ...getHeaders(),
            'x-session-id': sessionId,
            'x-terminal-id': terminalId
          }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fire items');
        }

        const data = await response.json();
        return data.data;
      } catch (err: any) {
        const errorMsg = err.message || 'Error firing items';
        setError(errorMsg);
        console.error('[FIRE] Error:', errorMsg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const recall = useCallback(
    async (orderId: string, fireBatchId: string, sessionId: string, terminalId: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/orders/${orderId}/recall/${fireBatchId}`, {
          method: 'POST',
          headers: {
            ...getHeaders(),
            'x-session-id': sessionId,
            'x-terminal-id': terminalId
          }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to recall batch');
        }

        const data = await response.json();
        return data.data;
      } catch (err: any) {
        const errorMsg = err.message || 'Error recalling batch';
        setError(errorMsg);
        console.error('[RECALL] Error:', errorMsg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateItemStatus = useCallback(
    async (
      orderId: string,
      itemId: string,
      newStatus: ItemStatus,
      sessionId: string,
      terminalId: string,
      skipReason?: SkipReason,
      undoReason?: string
    ) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/orders/${orderId}/items/${itemId}/status`, {
          method: 'PUT',
          headers: {
            ...getHeaders(),
            'x-session-id': sessionId,
            'x-terminal-id': terminalId
          },
          body: JSON.stringify({
            newStatus,
            skipReason,
            undoReason
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update item status');
        }

        const data = await response.json();
        return data.data;
      } catch (err: any) {
        const errorMsg = err.message || 'Error updating item status';
        setError(errorMsg);
        console.error('[UPDATE_STATUS] Error:', errorMsg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const approveSkip = useCallback(
    async (
      orderItemId: string,
      approvalAction: 'APPROVE_SKIP' | 'DENY_SKIP',
      reason: string,
      sessionId: string,
      terminalId: string
    ) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/approvals/skip-approval`, {
          method: 'POST',
          headers: {
            ...getHeaders(),
            'x-session-id': sessionId,
            'x-terminal-id': terminalId
          },
          body: JSON.stringify({
            orderItemId,
            approvalAction,
            reason
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to approve skip');
        }

        const data = await response.json();
        return data.data;
      } catch (err: any) {
        const errorMsg = err.message || 'Error approving skip';
        setError(errorMsg);
        console.error('[APPROVE_SKIP] Error:', errorMsg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    fire,
    recall,
    updateItemStatus,
    approveSkip
  };
};
