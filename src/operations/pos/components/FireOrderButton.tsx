/**
 * FireOrderButton.tsx
 * 
 * Component to fire all DRAFT items in an order to the kitchen
 * Displays confirmation and success/error states
 */

import React, { useState } from 'react';
import { Flame, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useOrderWorkflow } from '../hooks/useOrderWorkflow';

interface FireOrderButtonProps {
  orderId: string;
  draftItemCount: number;
  sessionId: string;
  terminalId: string;
  disabled?: boolean;
  onFireSuccess?: (result: any) => void;
  onFireError?: (error: string) => void;
}

export const FireOrderButton: React.FC<FireOrderButtonProps> = ({
  orderId,
  draftItemCount,
  sessionId,
  terminalId,
  disabled = false,
  onFireSuccess,
  onFireError
}) => {
  const { fire, loading, error } = useOrderWorkflow();
  const [showConfirm, setShowConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Disable if no draft items or session missing
  const isDisabled = disabled || draftItemCount === 0 || !sessionId || loading;

  const handleFire = async () => {
    setSuccessMessage(null);
    setLastError(null);

    const result = await fire(orderId, sessionId, terminalId);

    if (result) {
      setShowConfirm(false);
      setSuccessMessage(`✓ Fired ${result.items_fired} items to kitchen`);
      onFireSuccess?.(result);

      // Auto-dismiss success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } else if (error) {
      setLastError(error);
      onFireError?.(error);
    }
  };

  return (
    <div className="relative">
      {/* Main Button */}
      <button
        onClick={() => (draftItemCount > 0 ? setShowConfirm(true) : null)}
        disabled={isDisabled}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white
          transition-all duration-200
          ${isDisabled
            ? 'bg-gray-400 cursor-not-allowed opacity-50'
            : 'bg-red-500 hover:bg-red-600 active:scale-95'
          }
        `}
        title={draftItemCount === 0 ? 'No items to fire' : 'Send items to kitchen'}
      >
        <Flame size={18} />
        <span>Fire</span>
        {draftItemCount > 0 && (
          <span className="ml-1 text-sm opacity-90">({draftItemCount})</span>
        )}
      </button>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6 animate-in fade-in zoom-in">
            <div className="flex items-center gap-3 mb-4">
              <Flame className="text-red-500" size={24} />
              <h3 className="text-lg font-bold">Confirm Fire</h3>
            </div>

            <p className="text-gray-700 mb-6">
              Fire <strong className="text-red-600">{draftItemCount}</strong> items to the kitchen?
            </p>

            <p className="text-sm text-gray-600 mb-6">
              Once fired, items cannot be recalled for 60 seconds.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-semibold
                  hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFire}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-semibold
                  hover:bg-red-600 disabled:bg-gray-400 transition-colors
                  flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Firing...
                  </>
                ) : (
                  <>
                    <Flame size={18} />
                    Confirm Fire
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div
          className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-3 rounded-lg
            flex items-center gap-2 shadow-lg animate-in slide-in-from-bottom z-50"
        >
          <CheckCircle size={18} />
          {successMessage}
        </div>
      )}

      {/* Error Message */}
      {(lastError || error) && (
        <div
          className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg
            flex items-center gap-2 shadow-lg animate-in slide-in-from-bottom z-50"
        >
          <AlertCircle size={18} />
          {lastError || error}
        </div>
      )}
    </div>
  );
};
