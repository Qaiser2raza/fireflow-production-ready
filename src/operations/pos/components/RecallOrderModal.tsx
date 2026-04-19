/**
 * RecallOrderModal.tsx
 * 
 * Component to recall a batch within 60-second window
 * Shows remaining time and item count
 */

import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Loader2, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useOrderWorkflow } from '../hooks/useOrderWorkflow';

interface RecallOrderModalProps {
  orderId: string;
  fireBatchId: string;
  firedItemCount: number;
  firedAt: Date;
  sessionId: string;
  terminalId: string;
  isOpen: boolean;
  onClose: () => void;
  onRecallSuccess?: (result: any) => void;
  onRecallError?: (error: string) => void;
}

export const RecallOrderModal: React.FC<RecallOrderModalProps> = ({
  orderId,
  fireBatchId,
  firedItemCount,
  firedAt,
  sessionId,
  terminalId,
  isOpen,
  onClose,
  onRecallSuccess,
  onRecallError
}) => {
  const { recall, loading, error } = useOrderWorkflow();
  const [remainingSeconds, setRemainingSeconds] = useState(60);
  const [isExpired, setIsExpired] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Calculate remaining time for 60-second recall window
  useEffect(() => {
    if (!isOpen || isExpired) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - firedAt.getTime()) / 1000;
      const remaining = Math.max(0, 60 - Math.ceil(elapsed));

      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        setIsExpired(true);
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isOpen, firedAt, isExpired]);

  const handleRecall = async () => {
    setSuccessMessage(null);
    setLastError(null);

    const result = await recall(orderId, fireBatchId, sessionId, terminalId);

    if (result) {
      setSuccessMessage(`✓ Recalled ${result.recalled_count} items (Batch v${result.batch_version})`);
      onRecallSuccess?.(result);

      // Auto-close after 2 seconds
      setTimeout(() => {
        onClose();
        setSuccessMessage(null);
      }, 2000);
    } else if (error) {
      setLastError(error);
      onRecallError?.(error);
    }
  };

  if (!isOpen) return null;

  const windowPercentage = (remainingSeconds / 60) * 100;
  const isWarning = remainingSeconds <= 15;
  const isCritical = remainingSeconds <= 5;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 animate-in fade-in zoom-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="text-blue-500" size={24} />
            <h3 className="text-lg font-bold">Recall Batch</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        {!isExpired ? (
          <>
            <p className="text-gray-700 mb-4">
              Items in batch: <strong className="text-blue-600">{firedItemCount}</strong>
            </p>

            {/* Recall Window Timer */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock size={16} className={isCritical ? 'text-red-500' : isWarning ? 'text-orange-500' : 'text-blue-500'} />
                  <span className="text-sm font-semibold">
                    Recall Window:
                  </span>
                </div>
                <span
                  className={`text-lg font-bold ${
                    isCritical ? 'text-red-600' : isWarning ? 'text-orange-600' : 'text-blue-600'
                  }`}
                >
                  {remainingSeconds}s
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 ${
                    isCritical
                      ? 'bg-red-500'
                      : isWarning
                      ? 'bg-orange-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${windowPercentage}%` }}
                />
              </div>

              {isCritical && (
                <p className="text-red-600 text-sm font-semibold mt-2">⚠️ Hurry! Window closing soon</p>
              )}
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Click "Confirm Recall" to pull these items back to the kitchen. You cannot recall once items start preparing.
            </p>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-semibold
                  hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRecall}
                disabled={loading || isExpired}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold
                  hover:bg-blue-600 disabled:bg-gray-400 transition-colors
                  flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Recalling...
                  </>
                ) : (
                  <>
                    <RotateCcw size={18} />
                    Confirm Recall
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
              <p className="text-red-700 font-semibold">Recall window expired</p>
            </div>
            <p className="text-gray-700 mb-6">
              The 60-second recall window has closed. Items may have started preparing in the kitchen.
            </p>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-300 text-gray-800 rounded-lg font-semibold
                hover:bg-gray-400 transition-colors"
            >
              Close
            </button>
          </>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle className="text-green-600" size={18} />
            <p className="text-green-700 text-sm font-semibold">{successMessage}</p>
          </div>
        )}

        {/* Error Message */}
        {(lastError || error) && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="text-red-600" size={18} />
            <p className="text-red-700 text-sm font-semibold">{lastError || error}</p>
          </div>
        )}
      </div>
    </div>
  );
};
