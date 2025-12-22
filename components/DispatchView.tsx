
import React, { useState } from 'react';
import { useAppContext } from '../App';
import { OrderStatus, Order, Transaction } from '../types';
import { MapPin, Navigation, User, Phone, Package, ArrowRight, CheckCircle2, Bike, Clock, AlertTriangle, Layers, Map as MapIcon, DollarSign, Check, Loader2, Zap, ShieldCheck } from 'lucide-react';

export const DispatchView: React.FC = () => {
  const { orders, drivers, assignDriverToOrder, completeDelivery, processPayment, currentUser, collectSingleOrderFromRider, addNotification } = useAppContext();
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'QUEUE' | 'FLEET' | 'MAP'>('QUEUE');
  const [isProcessingCollection, setIsProcessingCollection] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // PIPELINE: Show delivery orders ready for rider assignment
  const readyOrders = orders.filter(o => 
    o.type === 'delivery' && 
    (o.status === OrderStatus.READY) && 
    !o.assignedDriverId
  );
  
  // LIVE FEED: Show orders currently on the road or awaiting cashier settlement
  const activeDeliveries = orders.filter(o => 
    o.type === 'delivery' &&
    (o.status === OrderStatus.OUT_FOR_DELIVERY || o.status === OrderStatus.DELIVERED) &&
    !o.isSettledWithRider
  );
  
  const selectedDriver = drivers.find(d => d.id === selectedDriverId);

  const toggleOrderSelection = (id: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleDispatch = async () => {
    if (selectedOrderIds.length > 0 && selectedDriverId && !isDispatching) {
      setIsDispatching(true);
      try {
        await Promise.all(selectedOrderIds.map(orderId => assignDriverToOrder(orderId, selectedDriverId)));
        setSelectedOrderIds([]);
        setSelectedDriverId(null);
        addNotification('success', "Fleet Deployed. Tracks active.");
        setMobileTab('MAP'); 
      } catch (err) {
        console.error("Batch dispatch failed", err);
        addNotification('error', "Deployment failed.");
      } finally {
        setIsDispatching(false);
      }
    }
  };

  const handleManualComplete = async (order: Order) => {
    if (window.confirm(`Mark as Handed Over? Rider will take custody of Rs. ${order.total.toLocaleString()}.`)) {
      setIsProcessingCollection(order.id);
      try {
        const success = await completeDelivery(order.id);
        if (success) {
          addNotification('success', "Order Delivered. Cash now in Rider's custody.");
        }
      } catch (err) {
        console.error(err);
        addNotification('error', "Handover failed. Check connection.");
      } finally {
        setIsProcessingCollection(null);
      }
    }
  };

  const handleFullSettle = async (order: Order) => {
    if (window.confirm(`SETTLE LOGISTICS: Receive Rs. ${order.total.toLocaleString()} from Rider and close this bag?`)) {
       setIsProcessingCollection(`SETTLE-${order.id}`);
       try {
          // This context function handles: Transaction Record + Rider Cash Update + Order Status update
          const success = await collectSingleOrderFromRider(order.id);
          if (success) {
            addNotification('success', "Vault Updated. Rider liability cleared.");
          } else {
            addNotification('error', "Settlement failed. Try again.");
          }
       } catch (err) {
         console.error("Reconciliation error:", err);
         addNotification('error', "Critical error during reconciliation.");
       } finally {
          setIsProcessingCollection(null);
       }
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-slate-950 overflow-hidden relative">
      
      <div className="md:hidden h-12 bg-slate-900 border-b border-slate-800 flex items-center shrink-0">
         <button onClick={() => setMobileTab('QUEUE')} className={`flex-1 h-full text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${mobileTab === 'QUEUE' ? 'text-gold-500 border-b-2 border-gold-500' : 'text-slate-500'}`}>
            <Package size={14} /> Queue ({readyOrders.length})
         </button>
         <button onClick={() => setMobileTab('FLEET')} className={`flex-1 h-full text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${mobileTab === 'FLEET' ? 'text-gold-500 border-b-2 border-gold-500' : 'text-slate-500'}`}>
            <Bike size={14} /> Fleet
         </button>
         <button onClick={() => setMobileTab('MAP')} className={`flex-1 h-full text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${mobileTab === 'MAP' ? 'text-gold-500 border-b-2 border-gold-500' : 'text-slate-500'}`}>
            <MapIcon size={14} /> Live ({activeDeliveries.length})
         </button>
      </div>

      {/* ASSIGNMENT SIDEBAR */}
      <div className={`w-full md:w-[300px] border-r border-slate-800 bg-slate-900/50 flex-col ${mobileTab === 'QUEUE' ? 'flex' : 'hidden md:flex'}`}>
        <div className="p-4 border-b border-slate-800 bg-slate-900">
           <h2 className="text-gold-500 text-[10px] uppercase tracking-[0.2em] font-bold mb-1">Logistics</h2>
           <h1 className="text-lg text-white font-serif">Bag Assignment</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {readyOrders.length === 0 ? (
            <div className="text-center py-20 text-slate-700 text-[10px] uppercase tracking-widest flex flex-col items-center gap-3">
              <Package size={32} className="opacity-10" />
              <span>Queue Empty</span>
            </div>
          ) : (
            readyOrders.map(order => {
              const isSelected = selectedOrderIds.includes(order.id);
              return (
                <div 
                  key={order.id}
                  onClick={() => toggleOrderSelection(order.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer relative overflow-hidden
                    ${isSelected 
                      ? 'bg-gold-500/10 border-gold-500' 
                      : 'bg-slate-900 border-slate-800 hover:border-slate-600'}
                  `}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-slate-200 font-bold font-serif">#{order.id.split('-').pop()}</span>
                    <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded border bg-green-900/20 text-green-500 border-green-500/30">READY</span>
                  </div>
                  <div className="text-slate-300 text-xs font-bold truncate mb-1">{order.customerName}</div>
                  <div className="text-slate-500 text-[9px] line-clamp-1">Rs. {order.total.toLocaleString()}</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* FLEET SIDEBAR */}
      <div className={`w-full md:w-[260px] border-r border-slate-800 bg-slate-950 flex-col ${mobileTab === 'FLEET' ? 'flex' : 'hidden md:flex'}`}>
        <div className="p-4 border-b border-slate-800 bg-slate-950">
           <h1 className="text-lg text-white font-serif">Active Fleet</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
           {drivers.map(driver => (
             <button
               key={driver.id}
               disabled={driver.status === 'off-duty'}
               onClick={() => setSelectedDriverId(driver.id)}
               className={`w-full p-3 rounded-xl border text-left transition-all
                  ${selectedDriverId === driver.id 
                    ? 'bg-gold-500 text-black border-gold-500 shadow-xl' 
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'}
                  ${driver.status === 'off-duty' && 'opacity-30 grayscale cursor-not-allowed'}
               `}
             >
               <div className="flex items-center gap-2">
                 <Bike size={16} />
                 <div className="flex-1 min-w-0">
                   <div className="font-bold text-xs truncate">{driver.name}</div>
                   <div className="flex items-center justify-between mt-1">
                      <span className="text-[8px] font-black uppercase tracking-widest">{driver.status}</span>
                      <span className="text-[9px] font-mono font-bold text-gold-500">Rs.{driver.cashInHand.toLocaleString()}</span>
                   </div>
                 </div>
               </div>
             </button>
           ))}
        </div>

        <div className="p-3 border-t border-slate-800 bg-slate-900">
           <button
             onClick={handleDispatch}
             disabled={selectedOrderIds.length === 0 || !selectedDriverId || isDispatching}
             className={`w-full h-12 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all
               ${(selectedOrderIds.length === 0 || !selectedDriverId || isDispatching)
                 ? 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed'
                 : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20'}
             `}
           >
             {isDispatching ? <Loader2 size={16} className="animate-spin" /> : <><Navigation size={16} /> Deploy ({selectedOrderIds.length})</>}
           </button>
        </div>
      </div>

      {/* ROAD FEED: MAIN COLLECTION GRID */}
      <div className={`flex-1 bg-slate-900 flex-col overflow-hidden ${mobileTab === 'MAP' ? 'flex' : 'hidden md:flex'}`}>
        <div className="p-6 shrink-0 bg-gradient-to-b from-slate-950 to-transparent">
           <h2 className="text-gold-500 text-[10px] uppercase tracking-[0.2em] font-bold mb-1">Live Feed</h2>
           <h1 className="text-2xl text-white font-serif">Road & Collections</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-20 custom-scrollbar">
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {activeDeliveries.map(order => {
                const driver = drivers.find(d => d.id === order.assignedDriverId);
                const isDelivered = order.status === OrderStatus.DELIVERED;
                const isSettleProcessing = isProcessingCollection === `SETTLE-${order.id}`;
                const isHandoverProcessing = isProcessingCollection === order.id;

                return (
                  <div key={order.id} className={`bg-slate-850 border rounded-2xl p-4 shadow-2xl flex flex-col transition-all h-fit
                    ${isDelivered ? 'border-green-500/40 bg-green-900/5' : 'border-slate-700'}
                  `}>
                    <div className="flex justify-between items-center mb-3">
                       <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase ${isDelivered ? 'bg-green-600 text-white' : 'bg-gold-500 text-black'}`}>
                         #{order.id.split('-').pop()}
                       </span>
                       <span className="text-[10px] text-white font-mono font-bold">Rs.{order.total.toLocaleString()}</span>
                    </div>
                    
                    <div className="space-y-3 mb-4 flex-1">
                       <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${isDelivered ? 'bg-green-950 border-green-500/50 text-green-500' : 'bg-slate-950 border-slate-700 text-gold-500'}`}>
                             <Bike size={12} />
                          </div>
                          <span className="text-white font-bold text-[11px] truncate">{driver?.name || 'Rider Missing'}</span>
                       </div>
                       <div className="flex items-start gap-2">
                          <MapPin size={12} className="text-slate-600 mt-0.5 shrink-0" />
                          <span className="text-slate-400 text-[10px] leading-relaxed line-clamp-2">{order.deliveryAddress}</span>
                       </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800">
                       {!isDelivered ? (
                         <button 
                            onClick={(e) => { e.stopPropagation(); handleManualComplete(order); }}
                            disabled={isHandoverProcessing || isSettleProcessing}
                            className={`w-full py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border
                               ${isHandoverProcessing 
                                 ? 'bg-slate-800 text-slate-600 border-slate-700' 
                                 : 'bg-slate-950 border-slate-700 text-slate-400 hover:bg-green-600 hover:text-white'}
                            `}
                         >
                            {isHandoverProcessing ? <Loader2 size={12} className="animate-spin" /> : 'Confirm Handover'}
                         </button>
                       ) : (
                         <button 
                            onClick={(e) => { e.stopPropagation(); handleFullSettle(order); }}
                            disabled={isSettleProcessing || isHandoverProcessing}
                            className={`w-full py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border
                               ${isSettleProcessing 
                                 ? 'bg-slate-800 text-slate-600 border-slate-700' 
                                 : 'bg-green-600 text-white border-green-500 shadow-lg animate-pulse'}
                            `}
                         >
                            {isSettleProcessing ? <Loader2 size={12} className="animate-spin" /> : <><DollarSign size={12}/> Settle Cash</>}
                         </button>
                       )}
                    </div>
                  </div>
                );
              })}

              {activeDeliveries.length === 0 && (
                <div className="col-span-full py-32 flex flex-col items-center justify-center text-slate-700 gap-4 opacity-50">
                  <ShieldCheck size={64} className="text-gold-500/20" />
                  <p className="text-[11px] font-black uppercase tracking-[0.4em]">Clear Road</p>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
