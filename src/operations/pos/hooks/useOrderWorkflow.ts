/**
 * useOrderWorkflow.ts (POS)
 *
 * React hook for order workflow API calls from the Point of Sale interface.
 * Provides fire, recall, updateItemStatus, and approveSkip actions.
 *
 * Re-exported from the KDS hook for DRY code; both UIs share the same API layer.
 */

export {
  useOrderWorkflow,
  type FireResult,
  type RecallResult,
  type StatusUpdateResult,
  type ApprovalResult,
} from '../../kds/hooks/useOrderWorkflow';
