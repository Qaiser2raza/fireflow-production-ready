import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  QrCode, X, Check, XCircle, ChevronRight, Loader2,
  AlertTriangle, ShieldAlert, Clock, Users, Utensils,
  ChevronDown, StickyNote
} from 'lucide-react';
import { socketIO } from '../../../shared/lib/socketClient';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

// ─── Types ───────────────────────────────────────────────────────────────────

interface QROrderItem {
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
}

interface PendingQROrder {
  id: string;
  table_number: number;
  table_label: string | null;
  items: QROrderItem[];
  subtotal: number;
  notes: string | null;
  customer_name: string | null;
  submitted_at: string;
  sig_verified: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0 })}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const QRApprovalQueue: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [orders, setOrders] = useState<PendingQROrder[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, 'approve' | 'reject' | null>>({});
  const [actionResult, setActionResult] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [hasNewOrder, setHasNewOrder] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch current pending queue from backend on mount
  const fetchPending = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/orders/qr-pending');
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch (err) {
      console.warn('[QRApprovalQueue] Could not fetch pending QR orders:', err);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // Real-time Socket.IO listeners
  useEffect(() => {
    const handleNewOrder = (order: PendingQROrder) => {
      setOrders(prev => {
        // Deduplicate: don't push if already in list
        if (prev.some(o => o.id === order.id)) return prev;
        return [order, ...prev];
      });
      setHasNewOrder(true);
      setIsOpen(true); // Auto-open drawer on new QR order
      // Play a soft notification chime if browser allows
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio(
            'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAA' // tiny silent fallback
          );
        }
        audioRef.current.play().catch(() => {});
      } catch {}
    };

    const handleApproved = ({ qr_order_id }: { qr_order_id: string }) => {
      setOrders(prev => prev.filter(o => o.id !== qr_order_id));
    };

    const handleRejected = ({ qr_order_id }: { qr_order_id: string }) => {
      setOrders(prev => prev.filter(o => o.id !== qr_order_id));
    };

    socketIO.on('qr_new_order', handleNewOrder);
    socketIO.on('qr_order_approved', handleApproved);
    socketIO.on('qr_order_rejected', handleRejected);

    return () => {
      socketIO.off('qr_new_order', handleNewOrder);
      socketIO.off('qr_order_approved', handleApproved);
      socketIO.off('qr_order_rejected', handleRejected);
    };
  }, []);

  // Clear the "new" badge indicator when drawer is opened
  useEffect(() => {
    if (isOpen) setHasNewOrder(false);
  }, [isOpen]);

  const handleApprove = async (order: PendingQROrder) => {
    setActionLoading(prev => ({ ...prev, [order.id]: 'approve' }));
    try {
      const res = await fetchWithAuth('/api/orders/qr-approve', {
        method: 'POST',
        body: JSON.stringify({ qr_order_id: order.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed');
      setActionResult(prev => ({ ...prev, [order.id]: 'approved' }));
      setTimeout(() => {
        setOrders(prev => prev.filter(o => o.id !== order.id));
        setActionResult(prev => {
          const next = { ...prev };
          delete next[order.id];
          return next;
        });
      }, 1200);
    } catch (err: any) {
      console.error('[QRApprovalQueue] Approve error:', err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [order.id]: null }));
    }
  };

  const handleReject = async (order: PendingQROrder) => {
    setActionLoading(prev => ({ ...prev, [order.id]: 'reject' }));
    try {
      const res = await fetchWithAuth('/api/orders/qr-reject', {
        method: 'POST',
        body: JSON.stringify({ qr_order_id: order.id, reason: 'Declined by cashier' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rejection failed');
      setActionResult(prev => ({ ...prev, [order.id]: 'rejected' }));
      setTimeout(() => {
        setOrders(prev => prev.filter(o => o.id !== order.id));
        setActionResult(prev => {
          const next = { ...prev };
          delete next[order.id];
          return next;
        });
      }, 1000);
    } catch (err: any) {
      console.error('[QRApprovalQueue] Reject error:', err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [order.id]: null }));
    }
  };

  const pendingCount = orders.length;

  return (
    <>
      {/* ── Floating Trigger Button ────────────────────────────────────────── */}
      <button
        id="qr-approval-queue-trigger"
        onClick={() => setIsOpen(v => !v)}
        className={`
          fixed bottom-6 right-6 z-[80] flex items-center gap-2.5
          h-14 rounded-2xl px-4 shadow-2xl transition-all duration-300
          border backdrop-blur-sm group
          ${pendingCount > 0
            ? 'bg-amber-500 hover:bg-amber-400 border-amber-400/50 text-slate-950 shadow-amber-500/30'
            : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700/60 text-slate-300 hover:text-white'
          }
        `}
        title="QR Self-Order Queue"
      >
        <div className="relative">
          <QrCode size={20} className={pendingCount > 0 ? 'text-slate-950' : ''} />
          {pendingCount > 0 && (
            <span className={`
              absolute -top-2.5 -right-2.5 min-w-[18px] h-[18px] rounded-full
              flex items-center justify-center text-[10px] font-black
              bg-red-600 text-white border-2 border-amber-500
              ${hasNewOrder ? 'animate-bounce' : ''}
            `}>
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </div>
        <div className="flex flex-col items-start leading-tight">
          <span className="text-[11px] font-black uppercase tracking-wider">
            {pendingCount > 0 ? `${pendingCount} QR Order${pendingCount !== 1 ? 's' : ''}` : 'QR Orders'}
          </span>
          {pendingCount > 0 && (
            <span className="text-[9px] font-bold opacity-70">Awaiting approval</span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[75] bg-black/40 backdrop-blur-[2px]"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ── Slide-up Drawer ───────────────────────────────────────────────── */}
      <div className={`
        fixed bottom-0 right-0 z-[79] w-full sm:w-[460px] max-h-[80vh]
        bg-[#0B0F1A] border-t border-l border-slate-800/80
        rounded-tl-3xl shadow-2xl flex flex-col
        transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
        ${isOpen ? 'translate-y-0' : 'translate-y-full'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`
              w-9 h-9 rounded-xl flex items-center justify-center border
              ${pendingCount > 0
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                : 'bg-slate-800/60 border-slate-700/50 text-slate-400'
              }
            `}>
              <QrCode size={16} />
            </div>
            <div>
              <h2 className="text-white text-sm font-black uppercase tracking-widest">
                QR Self-Order Queue
              </h2>
              <p className="text-slate-500 text-[10px] font-medium">
                {pendingCount === 0
                  ? 'No orders pending approval'
                  : `${pendingCount} order${pendingCount !== 1 ? 's' : ''} waiting for cashier review`
                }
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all"
          >
            <X size={14} />
          </button>
        </div>

        {/* Orders list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {pendingCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex items-center justify-center mb-4">
                <QrCode size={28} className="text-slate-600" />
              </div>
              <p className="text-slate-500 text-xs font-black uppercase tracking-widest">No Pending QR Orders</p>
              <p className="text-slate-700 text-[10px] mt-1 font-medium">
                Orders from table QR codes will appear here in real-time.
              </p>
            </div>
          ) : (
            orders.map(order => {
              const isApproved = actionResult[order.id] === 'approved';
              const isRejected = actionResult[order.id] === 'rejected';
              const isActing = !!actionLoading[order.id];
              const isExpanded = expandedId === order.id;

              return (
                <div
                  key={order.id}
                  className={`
                    rounded-2xl border overflow-hidden transition-all duration-500
                    ${isApproved
                      ? 'bg-green-500/10 border-green-500/30'
                      : isRejected
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-slate-900/70 border-slate-800/70 hover:border-slate-700/70'
                    }
                  `}
                >
                  {/* Order card header */}
                  <button
                    className="w-full px-4 py-3 flex items-center gap-3 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  >
                    {/* Table badge */}
                    <div className={`
                      w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 border
                      ${order.sig_verified
                        ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                      }
                    `}>
                      <Utensils size={14} />
                      <span className="text-[9px] font-black leading-none mt-0.5">
                        {order.table_label || `T${order.table_number}`}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-xs font-black">
                          Table {order.table_number}
                          {order.table_label && ` — ${order.table_label}`}
                        </span>
                        {!order.sig_verified && (
                          <span className="flex items-center gap-1 text-amber-400 text-[9px] font-black uppercase bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-lg">
                            <AlertTriangle size={9} />
                            Unverified
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-slate-400 text-[10px] font-medium">
                          {order.items?.length ?? 0} item{order.items?.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-amber-400 text-[10px] font-black">
                          {formatCurrency(order.subtotal)}
                        </span>
                        <span className="flex items-center gap-1 text-slate-600 text-[10px] font-medium">
                          <Clock size={9} />
                          {timeAgo(order.submitted_at)}
                        </span>
                      </div>
                    </div>

                    <ChevronRight
                      size={14}
                      className={`text-slate-600 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-3 border-t border-slate-800/60">
                      {/* Items list */}
                      <div className="pt-3 space-y-1.5">
                        {(order.items || []).map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-black shrink-0">
                                {item.quantity}×
                              </span>
                              <span className="text-slate-200 font-medium">{item.name}</span>
                            </div>
                            <span className="text-slate-400 font-medium">
                              {formatCurrency(item.unit_price * item.quantity)}
                            </span>
                          </div>
                        ))}
                        {/* Subtotal */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                          <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Subtotal</span>
                          <span className="text-white text-xs font-black">{formatCurrency(order.subtotal)}</span>
                        </div>
                      </div>

                      {/* Customer name */}
                      {order.customer_name && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <Users size={10} className="shrink-0" />
                          <span>{order.customer_name}</span>
                        </div>
                      )}

                      {/* Notes */}
                      {order.notes && (
                        <div className="flex items-start gap-2 bg-slate-800/50 border border-slate-700/40 rounded-xl p-2.5">
                          <StickyNote size={10} className="text-slate-500 shrink-0 mt-0.5" />
                          <span className="text-slate-300 text-[10px] font-medium leading-relaxed">{order.notes}</span>
                        </div>
                      )}

                      {/* Signature warning */}
                      {!order.sig_verified && (
                        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5">
                          <ShieldAlert size={12} className="text-amber-400 shrink-0" />
                          <span className="text-amber-300 text-[10px] font-medium">
                            Table QR signature could not be verified. Proceed with caution.
                          </span>
                        </div>
                      )}

                      {/* Action feedback */}
                      {isApproved && (
                        <div className="flex items-center gap-2 bg-green-500/15 border border-green-500/30 rounded-xl p-3">
                          <Check size={14} className="text-green-400 shrink-0 animate-bounce" />
                          <span className="text-green-300 text-xs font-black">Order approved! Sent to kitchen.</span>
                        </div>
                      )}
                      {isRejected && (
                        <div className="flex items-center gap-2 bg-red-500/15 border border-red-500/30 rounded-xl p-3">
                          <XCircle size={14} className="text-red-400 shrink-0" />
                          <span className="text-red-300 text-xs font-black">Order rejected.</span>
                        </div>
                      )}

                      {/* CTA Buttons */}
                      {!isApproved && !isRejected && (
                        <div className="flex gap-2 pt-1">
                          <button
                            id={`qr-approve-${order.id}`}
                            onClick={() => handleApprove(order)}
                            disabled={isActing}
                            className="flex-1 h-11 bg-green-600 hover:bg-green-500 disabled:opacity-60 active:scale-[0.97]
                              text-white font-black text-[11px] uppercase tracking-widest rounded-xl
                              flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/30"
                          >
                            {actionLoading[order.id] === 'approve'
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Check size={13} />
                            }
                            Approve & Fire
                          </button>
                          <button
                            id={`qr-reject-${order.id}`}
                            onClick={() => handleReject(order)}
                            disabled={isActing}
                            className="h-11 px-4 bg-red-500/15 hover:bg-red-500/30 border border-red-500/30
                              text-red-400 hover:text-red-300 font-black text-[11px] uppercase tracking-widest rounded-xl
                              flex items-center justify-center gap-2 transition-all disabled:opacity-60 active:scale-[0.97]"
                          >
                            {actionLoading[order.id] === 'reject'
                              ? <Loader2 size={13} className="animate-spin" />
                              : <XCircle size={13} />
                            }
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800/60 flex items-center justify-between shrink-0">
          <span className="text-[9px] text-slate-700 font-black uppercase tracking-widest">
            FireFlow QR Bridge v1.0
          </span>
          <button
            onClick={fetchPending}
            className="text-[9px] text-slate-500 hover:text-slate-300 font-black uppercase tracking-widest transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    </>
  );
};
