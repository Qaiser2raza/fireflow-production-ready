import React from 'react';
import { OrderBreakdown, OrderType } from '../../types';

interface OrderSummaryProps {
  breakdown: OrderBreakdown;
  type?: OrderType;
  compact?: boolean;
  className?: string;
}

export const OrderSummary: React.FC<OrderSummaryProps> = ({ 
  breakdown, 
  type, 
  compact = false,
  className = '' 
}) => {
  const formatCurrency = (val: number) => `Rs. ${Math.round(val).toLocaleString()}`;

  const SummaryRow: React.FC<{ label: string; value: number; isNegative?: boolean }> = ({ 
    label, 
    value, 
    isNegative = false 
  }) => (
    <div className="flex justify-between items-center py-1">
      <span className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">
        {label}
      </span>
      <span className="text-white font-mono text-sm">
        {isNegative && value > 0 ? '-' : ''}{formatCurrency(value)}
      </span>
    </div>
  );

  return (
    <div className={`space-y-1 ${compact ? '' : 'bg-slate-900/40 p-4 rounded-xl border border-slate-800/50'} ${className}`}>
      <SummaryRow label="Subtotal" value={breakdown.subtotal} />
      
      {type === 'dine-in' && breakdown.serviceCharge > 0 && (
        <SummaryRow label="Service Charge (5%)" value={breakdown.serviceCharge} />
      )}
      
      {type === 'delivery' && breakdown.deliveryFee > 0 && (
        <SummaryRow label="Delivery Fee" value={breakdown.deliveryFee} />
      )}
      
      {breakdown.tax > 0 && (
        <SummaryRow label="Tax" value={breakdown.tax} />
      )}
      
      {breakdown.discount > 0 && (
        <SummaryRow label="Discount" value={breakdown.discount} isNegative />
      )}
      
      <div className="pt-3 mt-2 border-t border-slate-800 flex justify-between items-end">
        <span className="text-slate-500 text-[10px] uppercase tracking-[0.2em] font-black mb-1">
          Total Amount
        </span>
        <span className="text-gold-500 font-bold text-xl font-serif">
          {formatCurrency(breakdown.total)}
        </span>
      </div>
    </div>
  );
};