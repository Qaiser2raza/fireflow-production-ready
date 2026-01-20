
import React, { useMemo } from 'react';
import { useAppContext } from '../../../client/App';
import { Zap, Bike, ShoppingBag } from 'lucide-react';

export const PulseSidebar: React.FC = () => {
  const { orders } = useAppContext();

  const pulseOrders = useMemo(() => 
    orders.filter(o => (o.type === 'TAKEAWAY' || o.type === 'DELIVERY') && o.status !== 'PAID'), 
    [orders]
  );

  return (
    <aside className="hidden xl:flex flex-col w-[350px] border-l border-slate-800 bg-[#0f172a]/30">
      <div className="p-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/40">
         <div className="flex items-center gap-2">
            <Zap className="text-[#ffd900] animate-pulse" size={18} />
            <span className="text-sm font-black uppercase tracking-widest">The Pulse</span>
         </div>
         <span className="bg-[#ffd900]/10 text-[#ffd900] text-[10px] px-2 py-0.5 rounded font-black border border-[#ffd900]/20">
           {pulseOrders.length} ACTIVE
         </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {pulseOrders.map(order => (
          <div key={order.id} className={`p-4 rounded-xl bg-slate-800 border-l-4 ${order.type === 'DELIVERY' ? 'border-blue-500' : 'border-[#ffd900]'}`}>
            <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase mb-1">
              <span>{order.type}</span>
              <span className="text-white">#{order.id.slice(-4)}</span>
            </div>
            <div className="text-sm font-bold truncate">{order.customer_name || 'Guest'}</div>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
              {order.type === 'DELIVERY' ? <Bike size={14} /> : <ShoppingBag size={14} />}
              <span className="font-bold text-blue-400">{order.status}</span>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};