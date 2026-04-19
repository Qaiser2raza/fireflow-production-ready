/**
 * OrderItemStatusUpdater.tsx
 * 
 * Component for KDS to update order item status
 * Provides transition validation and skip reason selection
 */

import React, { useState } from 'react';
import { ItemStatus, SkipReason } from '@prisma/client';
import { CheckCircle2, Loader2, AlertCircle, ChefHat, X } from 'lucide-react';
import { useOrderWorkflow } from '../hooks/useOrderWorkflow';

interface OrderItemStatusUpdaterProps {
  orderId: string;
  itemId: string;
  itemName: string;
  currentStatus: ItemStatus;
  sessionId: string;
  terminalId: string;
  onStatusChange?: (newStatus: ItemStatus, approvalRequired: boolean) => void;
  onError?: (error: string) => void;
}

const STATUS_COLORS: Record<ItemStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  PREPARING: 'bg-blue-100 text-blue-800',
  DONE: 'bg-green-100 text-green-800',
  SERVED: 'bg-emerald-100 text-emerald-800',
  SKIPPED: 'bg-red-100 text-red-800'
};

const getValidTransitions = (status: ItemStatus): ItemStatus[] => {
  const transitions: Record<ItemStatus, ItemStatus[]> = {
    DRAFT: ['PENDING', 'SKIPPED'],
    PENDING: ['PREPARING', 'SKIPPED'],
    PREPARING: ['DONE', 'SKIPPED'],
    DONE: ['SERVED', 'SKIPPED'],
    SERVED: ['SKIPPED'],
    SKIPPED: []
  };
  return transitions[status] || [];
};

export const OrderItemStatusUpdater: React.FC<OrderItemStatusUpdaterProps> = ({
  orderId,
  itemId,
  currentStatus,
  sessionId,
  terminalId,
  onStatusChange,
  onError
}) => {
  const { updateItemStatus, loading, error } = useOrderWorkflow();
  const [showOptions, setShowOptions] = useState(false);
  const [selectedReason, setSelectedReason] = useState<SkipReason | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [undoReason, setUndoReason] = useState<string>('');
  const [showUndoModal, setShowUndoModal] = useState(false);

  const validTransitions = getValidTransitions(currentStatus);

  const handleStatusUpdate = async (newStatus: ItemStatus) => {
    setLastError(null);
    setSuccessMessage(null);

    // Special case: DONE undo
    if (currentStatus === 'DONE' && newStatus === 'DONE') {
      setShowUndoModal(true);
      return;
    }

    // If transitioning to SKIPPED, show reason selector
    if (newStatus === 'SKIPPED') {
      setSelectedReason(null);
      return;
    }

    const result = await updateItemStatus(
      orderId,
      itemId,
      newStatus,
      sessionId,
      terminalId,
      undefined,
      undefined
    );

    if (result) {
      setSuccessMessage(`✓ Updated to ${newStatus}`);
      setShowOptions(false);
      onStatusChange?.(newStatus, result.approval_required);

      setTimeout(() => setSuccessMessage(null), 2000);
    } else if (error) {
      setLastError(error);
      onError?.(error);
    }
  };

  const handleSkipConfirm = async (reason: SkipReason) => {
    setLastError(null);
    setSuccessMessage(null);

    const result = await updateItemStatus(
      orderId,
      itemId,
      'SKIPPED',
      sessionId,
      terminalId,
      reason,
      undefined
    );

    if (result) {
      if (result.approval_required) {
        setSuccessMessage('✓ Skip requires manager approval');
        onStatusChange?.('SKIPPED', true);
      } else {
        setSuccessMessage(`✓ Item skipped (${reason})`);
        onStatusChange?.('SKIPPED', false);
      }
      setShowOptions(false);
      setSelectedReason(null);

      setTimeout(() => setSuccessMessage(null), 2000);
    } else if (error) {
      setLastError(error);
      onError?.(error);
    }
  };

  const handleUndoConfirm = async () => {
    if (!undoReason.trim()) {
      setLastError('Undo reason is required');
      return;
    }

    setLastError(null);
    setSuccessMessage(null);

    const result = await updateItemStatus(
      orderId,
      itemId,
      'PREPARING',
      sessionId,
      terminalId,
      undefined,
      undoReason
    );

    if (result) {
      setSuccessMessage(`✓ Undone: ${undoReason}`);
      setShowUndoModal(false);
      setUndoReason('');
      onStatusChange?.(result.status, false);

      setTimeout(() => setSuccessMessage(null), 2000);
    } else if (error) {
      setLastError(error);
      onError?.(error);
    }
  };

  return (
    <div className="relative">
      {/* Current Status Display */}
      <button
        onClick={() => setShowOptions(!showOptions)}
        className={`
          px-3 py-2 rounded-lg font-semibold text-sm
          flex items-center gap-2 transition-all
          ${STATUS_COLORS[currentStatus]}
          hover:opacity-80 active:scale-95
        `}
      >
        <ChefHat size={16} />
        {currentStatus}
      </button>

      {/* Status Options Menu */}
      {showOptions && (
        <div className="absolute top-full mt-2 left-0 bg-white border border-gray-300 rounded-lg shadow-lg z-40 min-w-max">
          {selectedReason === null ? (
            <>
              {/* Status Transitions */}
              {validTransitions.map(nextStatus => (
                <button
                  key={nextStatus}
                  onClick={() => {
                    if (nextStatus === 'SKIPPED') {
                      setSelectedReason('CUSTOMER_CANCELLED'); // Show reason selector
                    } else {
                      handleStatusUpdate(nextStatus);
                    }
                  }}
                  disabled={loading}
                  className={`
                    w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors
                    first:rounded-t-lg disabled:opacity-50 disabled:cursor-not-allowed
                    flex items-center gap-2 font-semibold text-sm
                    ${STATUS_COLORS[nextStatus]}
                  `}
                >
                  {loading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  {nextStatus}
                </button>
              ))}

              {/* Cancel */}
              <button
                onClick={() => setShowOptions(false)}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors
                  rounded-b-lg text-gray-700 font-semibold text-sm border-t"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {/* Skip Reason Selector */}
              <div className="p-4 min-w-64">
                <h4 className="font-bold text-sm mb-3">Skip Reason</h4>

                {(['CUSTOMER_CANCELLED', 'WRONG_ITEM', 'OUT_OF_STOCK', 'COMP'] as const).map(reason => (
                  <button
                    key={reason}
                    onClick={() => handleSkipConfirm(reason)}
                    disabled={loading}
                    className="w-full text-left px-3 py-2 mb-1 rounded bg-gray-50 hover:bg-gray-100
                      transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center gap-2"
                  >
                    {loading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-gray-400" />
                    )}
                    {reason}
                  </button>
                ))}

                <button
                  onClick={() => setSelectedReason(null)}
                  className="w-full text-left px-3 py-2 rounded bg-gray-50 hover:bg-gray-100
                    transition-colors text-sm font-semibold border-t mt-3
                    flex items-center gap-2 text-gray-600"
                >
                  <X size={14} />
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Undo Modal */}
      {showUndoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-4">Undo Done (30-Sec Window)</h3>
            <p className="text-gray-700 mb-4">Reason for undo:</p>
            <input
              type="text"
              value={undoReason}
              onChange={(e) => setUndoReason(e.target.value)}
              placeholder="e.g., Quality issue, wrong preparation..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4
                focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowUndoModal(false);
                  setUndoReason('');
                  setShowOptions(false);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-semibold
                  hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUndoConfirm}
                disabled={loading || !undoReason.trim()}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg font-semibold
                  hover:bg-orange-600 disabled:bg-gray-400 transition-colors
                  flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Undoing...
                  </>
                ) : (
                  'Confirm Undo'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="absolute top-full mt-2 left-0 bg-green-50 border border-green-300 rounded-lg
          p-2 text-green-700 text-sm font-semibold whitespace-nowrap z-40">
          {successMessage}
        </div>
      )}

      {/* Error Message */}
      {(lastError || error) && (
        <div className="absolute bottom-full mb-2 left-0 bg-red-50 border border-red-300 rounded-lg
          p-2 text-red-700 text-sm font-semibold z-40">
          <AlertCircle size={14} className="inline mr-1" />
          {lastError || error}
        </div>
      )}
    </div>
  );
};
