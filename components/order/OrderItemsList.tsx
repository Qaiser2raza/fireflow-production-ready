import React from 'react';
import { OrderItem } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { OrderStatusBadge } from './OrderStatusBadge';
import { Plus, Minus, Trash2, MessageSquare, AlertCircle } from 'lucide-react';

interface OrderItemsListProps {
  items: OrderItem[];
  editable?: boolean;
  showStatus?: boolean;
  showPrices?: boolean;
  onUpdateQuantity?: (index: number, newQuantity: number) => void;
  onRemove?: (index: number) => void;
  onAddNote?: (index: number) => void;
  className?: string;
}

export const OrderItemsList: React.FC<OrderItemsListProps> = ({
  items,
  editable = false,
  showStatus = false,
  showPrices = true,
  onUpdateQuantity,
  onRemove,
  onAddNote,
  className = ''
}) => {
  const formatCurrency = (val: number) => `Rs. ${Math.round(val).toLocaleString()}`;

  if (items.length === 0) {
    return (
      <Card className={`flex flex-col items-center justify-center py-12 text-slate-600 ${className}`}>
        <AlertCircle size={32} className="opacity-20 mb-2" />
        <p className="text-xs font-bold uppercase tracking-widest">No items added</p>
      </Card>
    );
  }

  return (
    <Card className={`p-0 overflow-hidden ${className}`}>
      <div className="divide-y divide-slate-800">
        {items.map((item, idx) => (
          <div key={`${item.menuItem.id}-${idx}`} className="p-4 flex justify-between items-start gap-4 hover:bg-slate-800/30 transition-colors">
            {/* Left Side: Info & Quantity Control */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-3">
                {editable ? (
                  <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 p-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={item.quantity <= 1}
                      onClick={() => onUpdateQuantity?.(idx, item.quantity - 1)}
                    >
                      <Minus size={12} />
                    </Button>
                    <span className="w-8 text-center text-xs font-black text-white font-mono">
                      {item.quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => onUpdateQuantity?.(idx, item.quantity + 1)}
                    >
                      <Plus size={12} />
                    </Button>
                  </div>
                ) : (
                  <div className="h-7 w-7 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                    {item.quantity}
                  </div>
                )}
                <div>
                  <h4 className="text-white font-medium leading-tight">{item.menuItem.name}</h4>
                  {item.menuItem.nameUrdu && (
                    <p className="text-slate-500 font-serif text-sm leading-tight mt-0.5">
                      {item.menuItem.nameUrdu}
                    </p>
                  )}
                </div>
              </div>

              {item.notes && (
                <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-bold uppercase mt-2">
                  <MessageSquare size={10} />
                  <span>{item.notes}</span>
                </div>
              )}
            </div>

            {/* Right Side: Status, Price & Actions */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-3">
                {showStatus && <OrderStatusBadge status={item.status} />}
                {showPrices && (
                  <div className="text-right">
                    <div className="text-white font-mono text-sm font-bold">
                      {formatCurrency(item.menuItem.price * item.quantity)}
                    </div>
                    {item.quantity > 1 && (
                      <div className="text-[10px] text-slate-500 font-mono">
                        {item.quantity} × {item.menuItem.price}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {editable && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-500 hover:text-white h-8 w-8 p-0"
                    onClick={() => onAddNote?.(idx)}
                    title="Add Kitchen Note"
                  >
                    <MessageSquare size={14} />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="h-8 w-8 p-0 bg-red-900/20 text-red-500 border border-red-900/30 hover:bg-red-600 hover:text-white"
                    onClick={() => onRemove?.(idx)}
                    title="Remove Item"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};