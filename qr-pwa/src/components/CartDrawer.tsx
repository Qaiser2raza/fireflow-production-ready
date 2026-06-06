import { useState } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import { submitOrder } from '../lib/api';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: any[];
  tableId: string;
  onUpdateQuantity: (id: string, qty: number) => void;
  onOrderPlaced: (orderId: string) => void;
  slug: string;
  total: number;
}

export function CartDrawer({ isOpen, onClose, items, tableId, slug, onUpdateQuantity, onOrderPlaced, total }: CartDrawerProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError('');
      const res = await submitOrder(slug, tableId, items, total);
      onOrderPlaced(res.order_id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full md:w-[400px] bg-card shadow-2xl z-50 flex flex-col transform transition-transform duration-300 border-l border-border">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground uppercase tracking-widest">Your Order</h2>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-slate-800/50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {items.length === 0 ? (
            <p className="text-center text-muted-foreground mt-8 text-sm">Your cart is empty.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 bg-slate-800/20 p-3 rounded-xl border border-slate-700/30">
                <div className="flex-1">
                  <h4 className="font-bold text-foreground text-sm">{item.name}</h4>
                  <p className="text-xs text-primary font-medium mt-1">Rs. {item.price}</p>
                </div>
                <div className="flex items-center gap-3 bg-slate-800/50 rounded-full p-1 border border-slate-700/50">
                  <button 
                    onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-700 shadow-sm text-slate-300 hover:text-primary transition-colors hover:bg-slate-600"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-4 text-center font-bold text-sm text-foreground">{item.quantity}</span>
                  <button 
                    onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-700 shadow-sm text-slate-300 hover:text-primary transition-colors hover:bg-slate-600"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-5 border-t border-border bg-slate-900/50">
            {error && <p className="text-red-400 text-sm mb-3 font-medium bg-red-500/10 p-2 rounded-lg border border-red-500/20">{error}</p>}
            <div className="flex justify-between items-center mb-5">
              <span className="font-bold text-muted-foreground text-sm uppercase tracking-widest">Total</span>
              <span className="text-xl font-black text-white">Rs. {total.toFixed(2)}</span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-primary hover:bg-amber-400 text-primary-foreground py-4 px-4 rounded-xl font-black uppercase tracking-widest disabled:opacity-50 transition-all shadow-lg shadow-primary/20 active:scale-[0.98]"
            >
              {submitting ? 'Placing Order...' : 'Place Order'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
