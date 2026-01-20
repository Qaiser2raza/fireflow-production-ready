
import React from 'react';
import { useAppContext } from '../../../client/App'; // Note: Four dots to go up from operations/dashboard/components
import { Clock, Plus, Minus } from 'lucide-react';

export const MissionTableCard: React.FC<{ table: any }> = ({ table }) => {
  const { orders, setOrderToEdit, setActiveView } = useAppContext();
  
  const order = orders.find(o => o.table_id === table.id && o.status !== 'PAID' && o.status !== 'CANCELLED');
  const isOccupied = table.status === 'OCCUPIED';
  const isBilling = table.status === 'PAYMENT_PENDING';

  return (
    <div 
      onClick={() => { setOrderToEdit(order || null); setActiveView('POS'); }}
      className={`relative rounded-3xl border p-5 transition-all cursor-pointer bg-slate-900 
        ${isBilling ? 'border-[#ffd900] animate-pulse shadow-[0_0_20px_rgba(255,217,0,0.2)]' : 
          isOccupied ? 'border-blue-500/50 shadow-lg shadow-blue-500/10' : 'border-slate-800 opacity-60'}`}
    >
      {isBilling && (
        <div className="absolute -top-2 -right-2 bg-[#ffd900] text-black text-[9px] font-black px-2 py-1 rounded-full uppercase">
          Bill Req
        </div>
      )}

      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-2xl font-black">{table.name}</h3>
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
            {isOccupied ? `${order?.guest_count || 0} Guests` : table.status}
          </p>
        </div>
        {isOccupied && <Clock size={16} className="text-blue-500" />}
      </div>

      {isOccupied && (
        <div className="flex items-center justify-between bg-black/40 rounded-xl p-1 mb-4">
          <button onClick={(e) => { e.stopPropagation(); }} className="p-2 text-slate-400 hover:text-white"><Minus size={18} /></button>
          <span className="font-black text-xl">{order?.guest_count || 0}</span>
          <button onClick={(e) => { e.stopPropagation(); }} className="p-2 text-slate-400 hover:text-white"><Plus size={18} /></button>
        </div>
      )}
      
      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-auto">
        <div className={`h-full transition-all ${isOccupied ? 'w-2/3 bg-blue-500' : isBilling ? 'w-full bg-[#ffd900]' : 'w-0'}`} />
      </div>
    </div>
  );
};