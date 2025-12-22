
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../App';
import { Driver, Order, OrderStatus, RiderSettlement } from '../types';
import { 
  Bike, 
  DollarSign, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Search, 
  ChevronRight, 
  User, 
  ClipboardList, 
  ArrowLeft,
  Calendar,
  Star,
  CheckSquare,
  Square,
  AlertTriangle,
  Loader2
} from 'lucide-react';

export const RiderManagementView: React.FC = () => {
  const { drivers, orders, settleRiderCash, currentUser } = useAppContext();
  const [activeTab, setActiveTab] = useState<'fleet' | 'zones' | 'history'>('fleet');
  const [selectedRider, setSelectedRider] = useState<Driver | null>(null);

  // Stats for Header
  const totalCashOnRoad = drivers.reduce((sum, d) => sum + d.cashInHand, 0);

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col overflow-hidden">
      {/* Header Stats */}
      <div className="p-8 border-b border-slate-800 bg-slate-900/50">
        <div className="flex justify-between items-center mb-8">
           <div>
             <h2 className="text-gold-500 text-xs font-bold uppercase tracking-[0.2em] mb-1">In-House Logistics</h2>
             <h1 className="text-3xl font-serif text-white">Cash Reconciliation</h1>
           </div>
           <div className="flex gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center gap-4 shadow-xl">
                 <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                    <DollarSign size={20}/>
                 </div>
                 <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Total COD on Road</div>
                    <div className="text-xl font-mono font-bold text-white">Rs. {totalCashOnRoad.toLocaleString()}</div>
                 </div>
              </div>
           </div>
        </div>

        <div className="flex gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 w-fit">
           {[
             { id: 'fleet', label: 'Rider Fleet', icon: <Bike size={16}/> },
             { id: 'history', label: 'Settlement Log', icon: <Clock size={16}/> }
           ].map(tab => (
             <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2
                 ${activeTab === tab.id ? 'bg-gold-500 text-black shadow-lg' : 'text-slate-500 hover:text-slate-300'}
               `}
             >
               {tab.icon} {tab.label}
             </button>
           ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        {activeTab === 'fleet' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
             {drivers.map(driver => {
               const riderOrders = orders.filter(o => o.assignedDriverId === driver.id && o.status === OrderStatus.DELIVERED && !o.isSettledWithRider);
               const pendingCount = riderOrders.length;
               
               return (
                 <div 
                   key={driver.id} 
                   onClick={() => setSelectedRider(driver)}
                   className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative group overflow-hidden cursor-pointer hover:border-gold-500/50 transition-all hover:-translate-y-1 shadow-2xl"
                 >
                    <div className="flex justify-between items-start mb-6">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 shadow-inner
                        ${driver.cashInHand > 5000 ? 'bg-red-500/10 border-red-500/50 text-red-500' : 'bg-slate-800 border-slate-700 text-slate-400'}
                      `}>
                        <User size={28}/>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border
                        ${driver.status === 'available' ? 'bg-green-900/10 text-green-400 border-green-900/50' : 'bg-yellow-900/10 text-yellow-500 border-yellow-900/50'}
                      `}>
                        {driver.status}
                      </div>
                    </div>

                    <div className="mb-6">
                      <h3 className="text-white font-bold text-xl leading-none mb-2">{driver.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 text-[10px] font-black uppercase tracking-widest">Rider ID: FF-{driver.id.split('-')[1]}</span>
                      </div>
                    </div>

                    <div className="space-y-3 mb-6">
                       <div className="flex justify-between items-end">
                          <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Unsettled Orders</span>
                          <span className="text-white font-mono font-bold text-lg">{pendingCount}</span>
                       </div>
                       <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gold-500 w-full opacity-30" />
                       </div>
                    </div>

                    <div className="bg-slate-950/50 border border-slate-800/50 rounded-2xl p-4 flex justify-between items-center">
                       <div>
                          <div className="text-[10px] text-slate-500 uppercase font-black mb-1">Cash in Hand</div>
                          <div className={`text-2xl font-serif font-bold ${driver.cashInHand > 0 ? 'text-gold-500' : 'text-slate-700'}`}>
                             Rs. {driver.cashInHand.toLocaleString()}
                          </div>
                       </div>
                       <div className="w-10 h-10 rounded-full bg-gold-500/10 flex items-center justify-center text-gold-500">
                          <ChevronRight size={20} />
                       </div>
                    </div>
                 </div>
               );
             })}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
             <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                <h3 className="text-white font-serif text-xl">Recent Settlements</h3>
                <button className="text-xs text-gold-500 font-bold uppercase tracking-widest">Download Ledger</button>
             </div>
             <div className="p-20 text-center text-slate-600 italic">No settlement history found for this shift.</div>
          </div>
        )}
      </div>

      {selectedRider && (
        <RiderSettlementModal 
          rider={selectedRider}
          onClose={() => setSelectedRider(null)}
          onSettle={async (settlement) => {
            const success = await settleRiderCash(settlement);
            if (success) setSelectedRider(null);
          }}
        />
      )}
    </div>
  );
};

const RiderSettlementModal: React.FC<{ 
  rider: Driver, 
  onClose: () => void, 
  onSettle: (s: RiderSettlement) => Promise<void> 
}> = ({ rider, onClose, onSettle }) => {
  const { orders, currentUser } = useAppContext();
  const [actualCash, setActualCash] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Filter delivered but unsettled orders for this rider
  const unsettledOrders = useMemo(() => {
    return orders.filter(o => 
      o.assignedDriverId === rider.id && 
      o.status === OrderStatus.DELIVERED && 
      !o.isSettledWithRider
    ).sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [orders, rider.id]);

  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>(unsettledOrders.map(o => o.id));

  const expectedCash = useMemo(() => {
    return unsettledOrders
      .filter(o => selectedOrderIds.includes(o.id))
      .reduce((sum, o) => sum + o.total, 0);
  }, [unsettledOrders, selectedOrderIds]);

  const receivedVal = parseInt(actualCash) || 0;
  const variance = receivedVal - expectedCash;
  const isExact = variance === 0 && receivedVal > 0;

  const toggleOrder = (id: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleConfirm = async () => {
    if (selectedOrderIds.length === 0) return;
    setIsProcessing(true);
    
    const settlement: RiderSettlement = {
      id: `SET-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      driverId: rider.id,
      amountCollected: receivedVal,
      amountExpected: expectedCash,
      shortage: -variance, // shortage is positive if received < expected
      timestamp: new Date(),
      processedBy: currentUser?.name || 'Manager'
    };

    await onSettle(settlement);
    setIsProcessing(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl rounded-[2.5rem] shadow-2xl flex flex-col lg:flex-row overflow-hidden animate-in zoom-in duration-300">
        
        {/* LEFT PANEL: RIDER SUMMARY */}
        <div className="w-full lg:w-80 bg-slate-950 border-r border-slate-800 flex flex-col">
           <div className="p-8 border-b border-slate-800">
              <button onClick={onClose} className="mb-8 text-slate-500 hover:text-white flex items-center gap-2 text-xs font-black uppercase tracking-widest">
                <ArrowLeft size={16} /> Back to Fleet
              </button>
              
              <div className="text-center">
                 <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-gold-400 to-gold-600 mx-auto mb-4 flex items-center justify-center text-slate-950 shadow-2xl">
                    <User size={48} strokeWidth={1.5} />
                 </div>
                 <h2 className="text-white font-serif text-2xl font-bold">{rider.name}</h2>
                 <div className="flex items-center justify-center gap-2 mt-2">
                    <Star className="text-gold-500 fill-gold-500" size={14}/>
                    <span className="text-gold-500 font-bold text-xs">4.8 Rating</span>
                 </div>
              </div>
           </div>

           <div className="flex-1 p-6 space-y-6">
              <div className="space-y-4">
                 <h3 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] border-b border-slate-800 pb-2">Rider Metrics</h3>
                 <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 flex items-center gap-2"><ClipboardList size={14}/> Total Runs</span>
                    <span className="text-white font-mono font-bold">{rider.totalDeliveries}</span>
                 </div>
                 <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 flex items-center gap-2"><Calendar size={14}/> Last Settled</span>
                    <span className="text-slate-300 font-mono text-xs">2h ago</span>
                 </div>
              </div>

              <div className="bg-gold-500/5 border border-gold-500/20 rounded-2xl p-5 space-y-2">
                 <span className="text-[10px] text-gold-500/60 font-black uppercase tracking-widest block">Accumulated COD</span>
                 <div className="text-3xl font-serif font-bold text-gold-500">Rs. {rider.cashInHand.toLocaleString()}</div>
              </div>
           </div>

           <div className="p-4 bg-slate-900/50 border-t border-slate-800 text-center">
              <div className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Manual Audit Required for Variances</div>
           </div>
        </div>

        {/* RIGHT PANEL: ORDER SELECTION & SETTLEMENT */}
        <div className="flex-1 flex flex-col bg-slate-900/40">
           <div className="p-8 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
              <div>
                <h3 className="text-white font-serif text-xl">Select Orders to Settle</h3>
                <p className="text-slate-500 text-xs uppercase tracking-widest font-bold mt-1">{unsettledOrders.length} Pending Delivered Orders</p>
              </div>
              <div className="flex gap-2">
                 <button 
                  onClick={() => setSelectedOrderIds(unsettledOrders.map(o => o.id))}
                  className="px-4 py-2 bg-slate-800 text-slate-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:text-white transition-all"
                 >
                   Select All COD
                 </button>
                 <button 
                  onClick={() => setSelectedOrderIds([])}
                  className="px-4 py-2 bg-slate-800 text-slate-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:text-white transition-all"
                 >
                   Clear
                 </button>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto p-8 space-y-3 custom-scrollbar">
              {unsettledOrders.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-30 gap-4">
                   <CheckCircle2 size={64} />
                   <span className="text-sm font-black uppercase tracking-[0.5em]">Nothing to settle</span>
                </div>
              ) : (
                unsettledOrders.map(order => {
                  const isSelected = selectedOrderIds.includes(order.id);
                  const elapsed = Math.floor((Date.now() - new Date(order.timestamp).getTime()) / 60000);
                  
                  return (
                    <div 
                      key={order.id}
                      onClick={() => toggleOrder(order.id)}
                      className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center gap-6 group
                        ${isSelected 
                          ? 'bg-gold-500/10 border-gold-500 shadow-lg' 
                          : 'bg-slate-950 border-slate-800 hover:border-slate-600'}
                      `}
                    >
                       <div className={`${isSelected ? 'text-gold-500' : 'text-slate-700'} transition-colors`}>
                          {isSelected ? <CheckSquare size={24} /> : <Square size={24} />}
                       </div>
                       
                       <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                             <span className="text-white font-bold font-serif text-lg">#{order.id.split('-')[1]}</span>
                             <span className="text-slate-500 text-xs font-bold">{order.customerName}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                             <span className="flex items-center gap-1"><MapPin size={12}/> {order.deliveryAddress}</span>
                             <span className="flex items-center gap-1 font-mono"><Clock size={12}/> {elapsed}m ago</span>
                          </div>
                       </div>

                       <div className="text-right">
                          <div className="text-[10px] text-slate-500 font-black uppercase mb-1">Order Value</div>
                          <div className={`text-xl font-mono font-bold ${isSelected ? 'text-gold-500' : 'text-slate-400'}`}>
                             Rs. {order.total.toLocaleString()}
                          </div>
                       </div>
                    </div>
                  );
                })
              )}
           </div>

           {/* SETTLEMENT SUMMARY FOOTER */}
           <div className="p-8 bg-slate-950 border-t border-slate-800">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-end">
                 <div className="space-y-4">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                       <span className="text-slate-500">Selected Orders</span>
                       <span className="text-white">{selectedOrderIds.length} COD</span>
                    </div>
                    <div className="flex justify-between items-end border-t border-slate-800 pt-3">
                       <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Expected COD</span>
                       <span className="text-2xl font-serif font-bold text-white">Rs. {expectedCash.toLocaleString()}</span>
                    </div>
                 </div>

                 <div className="space-y-3">
                    <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest block">Actual Cash Received</label>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 font-bold">Rs.</span>
                       <input 
                         type="number"
                         placeholder="0.00"
                         className="w-full bg-slate-900 border border-slate-800 rounded-xl py-4 pl-12 pr-4 text-white text-xl font-mono font-bold outline-none focus:border-gold-500 transition-all shadow-inner"
                         value={actualCash}
                         onChange={e => setActualCash(e.target.value)}
                       />
                    </div>
                 </div>

                 <div className="space-y-3">
                    <div className="flex justify-between items-end">
                       <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Variance</span>
                       <span className={`text-lg font-mono font-bold ${variance === 0 ? 'text-green-500' : variance < 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {variance === 0 ? 'Exact' : (variance > 0 ? `+${variance}` : variance)}
                       </span>
                    </div>
                    <button 
                      onClick={handleConfirm}
                      disabled={isProcessing || selectedOrderIds.length === 0 || !actualCash}
                      className={`w-full py-4 rounded-xl font-black uppercase tracking-[0.2em] text-[11px] flex items-center justify-center gap-3 shadow-2xl transition-all
                        ${isProcessing || selectedOrderIds.length === 0 || !actualCash
                          ? 'bg-slate-800 text-slate-600' 
                          : 'bg-gold-500 hover:bg-gold-400 text-slate-950 shadow-gold-500/20 active:scale-95'}
                      `}
                    >
                       {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={18}/> Confirm Settlement</>}
                    </button>
                 </div>
              </div>

              {Math.abs(variance) > 0 && (
                <div className="mt-6 flex items-center gap-3 bg-red-900/10 border border-red-900/30 p-3 rounded-xl animate-pulse">
                   <AlertTriangle className="text-red-500" size={16}/>
                   <span className="text-[10px] text-red-400 font-black uppercase tracking-widest">Discrepancy Detected. Ledger will be marked for audit.</span>
                </div>
              )}
           </div>
        </div>

      </div>
    </div>
  );
};
