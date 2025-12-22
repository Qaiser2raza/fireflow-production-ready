
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../App';
import { OrderStatus, Order, Transaction } from '../types';
import { Delete, Search, Receipt, CreditCard, ArrowRight, Clock, X, Loader2, AlertTriangle, Lock, Bike, Utensils, CheckCircle2, Printer } from 'lucide-react';

export const PaymentView: React.FC = () => {
  const { orders, drivers, processPayment, currentUser } = useAppContext();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [tenderedInput, setTenderedInput] = useState('');
  const [activeMethod, setActiveMethod] = useState<'CASH' | 'CARD' | 'RAAST'>('CASH');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'DINE_IN' | 'DELIVERY'>('DINE_IN');
  
  // Processing States
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<Order | null>(null);

  const selectedOrder = orders.find(o => o.id === selectedOrderId);

  // Helper to check if order is fully ready for payment
  const isOrderReadyForPayment = (order: Order): boolean => {
    if (order.type === 'delivery') {
        return order.status === OrderStatus.DELIVERED;
    }
    if (!order.items || order.items.length === 0) return true;
    return order.items.every(item => 
      item.status === OrderStatus.READY || 
      item.status === OrderStatus.DELIVERED ||
      (item.status !== OrderStatus.NEW && item.status !== OrderStatus.COOKING)
    );
  };

  // Smart Tender Logic
  useEffect(() => {
    if (selectedOrder) {
      if (activeMethod !== 'CASH') {
        setTenderedInput(selectedOrder.total.toString());
      } else {
        setTenderedInput('');
      }
    }
  }, [activeMethod, selectedOrder]);

  // Filter orders
  const payableOrders = useMemo(() => {
    const term = (searchQuery || '').toLowerCase();
    return orders
      .filter(o => o.status !== OrderStatus.PAID && o.status !== OrderStatus.DRAFT)
      .filter(o => {
          if (viewMode === 'DELIVERY') return o.type === 'delivery' && o.status === OrderStatus.DELIVERED;
          return o.type !== 'delivery';
      })
      .filter(o => {
        return (
          (o.id || '').toLowerCase().includes(term) ||
          (o.tableId || '').toLowerCase().includes(term) ||
          (o.customerName || '').toLowerCase().includes(term) ||
          (o.assignedDriverId && drivers.find(d=>d.id===o.assignedDriverId)?.name.toLowerCase().includes(term))
        );
      })
      .sort((a, b) => {
        const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
        const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
        return timeB - timeA;
      });
  }, [orders, searchQuery, viewMode, drivers]);

  // Keypad Logic
  const handlePress = (val: string) => {
    if (activeMethod !== 'CASH') return; 

    if (val === 'DEL') {
      setTenderedInput(prev => prev.slice(0, -1));
    } else if (val === 'CLR') {
      setTenderedInput('');
    } else if (val === 'EXACT') {
      if (selectedOrder) setTenderedInput(selectedOrder.total.toString());
    } else {
      if (tenderedInput.length > 7) return; 
      setTenderedInput(prev => prev + val);
    }
  };

  const handleOrderSelect = (order: Order) => {
    if (isOrderReadyForPayment(order)) {
      setSelectedOrderId(order.id);
      setActiveMethod('CASH');
      setTenderedInput('');
    }
  };

  const tenderedAmount = parseInt(tenderedInput) || 0;
  const changeDue = selectedOrder ? tenderedAmount - selectedOrder.total : 0;
  const isSufficient = selectedOrder ? tenderedAmount >= selectedOrder.total : false;

  const handlePayment = () => {
    if (selectedOrder) {
      if (!isOrderReadyForPayment(selectedOrder)) {
        alert("Order items pending. Cannot process payment.");
        return;
      }

      if (activeMethod === 'CASH' && !isSufficient) return;
      
      setIsProcessing(true);
      
      setTimeout(() => {
        const transaction: Transaction = {
          id: `TXN-${Math.floor(Math.random() * 1000000)}`,
          orderId: selectedOrder.id,
          amount: selectedOrder.total,
          method: activeMethod,
          tenderedAmount: activeMethod === 'CASH' ? tenderedAmount : undefined,
          changeGiven: activeMethod === 'CASH' ? changeDue : undefined,
          timestamp: new Date(),
          processedBy: currentUser?.name || 'Unknown'
        };

        processPayment(selectedOrder.id, transaction);
        setReceiptData({...selectedOrder}); 
        setIsProcessing(false);
        setShowReceipt(true);
        setSelectedOrderId(null);
        setTenderedInput('');
      }, 1500);
    }
  };

  const closeReceipt = () => {
    setShowReceipt(false);
    setReceiptData(null);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-slate-950 overflow-hidden">
      
      {/* LEFT PANE: Order List */}
      <div className={`w-full lg:w-80 bg-slate-900 border-r border-slate-800 flex flex-col z-10 shrink-0 transition-all ${selectedOrderId ? 'hidden lg:flex' : 'flex h-full'}`}>
        <div className="p-4 border-b border-slate-800">
           <h1 className="text-lg text-white font-serif font-medium mb-3">Settlement</h1>
           <div className="flex p-1 bg-slate-950 rounded-lg border border-slate-800">
              <button 
                onClick={() => { setViewMode('DINE_IN'); setSelectedOrderId(null); }}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded flex items-center justify-center gap-2 transition-all
                   ${viewMode === 'DINE_IN' ? 'bg-gold-500 text-black shadow' : 'text-slate-500 hover:text-slate-300'}
                `}
              >
                <cite><Utensils size={12} /></cite> Dine-In
              </button>
              <button 
                onClick={() => { setViewMode('DELIVERY'); setSelectedOrderId(null); }}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded flex items-center justify-center gap-2 transition-all
                   ${viewMode === 'DELIVERY' ? 'bg-gold-500 text-black shadow' : 'text-slate-500 hover:text-slate-300'}
                `}
              >
                <cite><Bike size={12} /></cite> Riders
              </button>
           </div>
        </div>
        
        <div className="p-2 border-b border-slate-800 bg-slate-900/50">
           <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg p-2">
            <Search size={14} className="text-slate-500" />
            <input 
              className="bg-transparent border-none outline-none text-slate-200 placeholder-slate-600 text-xs w-full font-medium"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {payableOrders.length === 0 ? (
             <div className="text-center py-10 text-slate-600 text-xs">No pending bills</div>
          ) : (
             payableOrders.map(order => {
               const isReady = isOrderReadyForPayment(order);
               const timeObj = order.timestamp instanceof Date ? order.timestamp : new Date(order.timestamp);
               const assignedDriver = drivers.find(d => d.id === order.assignedDriverId);

               return (
                 <div 
                   key={order.id}
                   onClick={() => handleOrderSelect(order)}
                   className={`p-3 rounded-lg transition-all border relative overflow-hidden group cursor-pointer
                     ${selectedOrderId === order.id 
                       ? 'bg-gold-500 text-slate-950 border-gold-500 shadow-md' 
                       : isReady 
                          ? 'bg-slate-800/50 text-slate-400 border-slate-800 hover:border-slate-600 hover:bg-slate-800'
                          : 'bg-slate-900/50 text-slate-600 border-slate-800 opacity-60'
                     }
                   `}
                 >
                   <div className="flex justify-between items-start mb-1">
                     <span className="font-serif font-bold text-sm">
                       {viewMode === 'DELIVERY' 
                         ? assignedDriver?.name || 'Unknown Rider'
                         : order.tableId || order.customerName || 'Walk-in'
                       }
                     </span>
                     <span className="font-mono text-xs font-bold">Rs.{(Number(order.total) || 0).toLocaleString()}</span>
                   </div>
                   
                   <div className="flex justify-between items-center text-[10px] opacity-70">
                     <div className="flex items-center gap-1">
                        {viewMode === 'DELIVERY' ? (
                            <span>{order.customerName}</span>
                        ) : (
                            <><cite><Clock size={10} /></cite> {timeObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</>
                        )}
                     </div>
                     <span className="uppercase tracking-wider font-bold">{order.type}</span>
                   </div>
                 </div>
               );
             })
          )}
        </div>
      </div>

      {/* RIGHT PANE: Flex-Based Payment Terminal */}
      <div className={`flex-1 bg-black flex items-center justify-center p-2 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 to-black relative overflow-hidden ${!selectedOrderId ? 'hidden lg:flex' : 'flex'}`}>
        
        <div className="w-full max-w-[380px] flex flex-col bg-slate-900 rounded-[1.5rem] shadow-2xl border-4 border-slate-800 relative z-20 overflow-hidden"
             style={{ maxHeight: 'calc(100vh - 24px)' }}
        >
          
          {selectedOrder ? (
            <div className="flex flex-col h-full w-full p-4 relative z-10">
              
              <button 
                 onClick={() => setSelectedOrderId(null)} 
                 className="lg:hidden absolute top-2 left-2 text-slate-500 hover:text-white z-50 p-2 bg-slate-800/50 rounded-full"
              >
                <ArrowRight className="rotate-180" size={16} />
              </button>

              <div className="shrink-0 space-y-3 mb-2">
                <div className="text-center pt-2">
                  <div className="text-slate-500 text-[10px] font-mono uppercase tracking-widest">
                    Order #{(selectedOrder.id || '').split('-')[1] || '---'}
                  </div>
                  <div className="flex items-start justify-center text-white font-serif -mt-1">
                    <span className="text-xs mt-2 mr-1 text-slate-500">Rs.</span>
                    <span className="text-3xl font-medium tracking-tight">
                      {(Number(selectedOrder.total) || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 text-center">
                  <div className={`flex-1 py-2 rounded border transition-colors
                     ${activeMethod === 'CASH' 
                        ? 'bg-slate-800 border-gold-500/30 text-gold-400' 
                        : 'bg-slate-800/50 border-slate-700/50 text-slate-500'}
                  `}>
                    <div className="text-[9px] uppercase tracking-wider mb-0.5 opacity-70">Tendered</div>
                    <div className="font-mono font-bold text-sm">
                        {activeMethod === 'CASH' ? (tenderedInput ? `Rs.${parseInt(tenderedInput).toLocaleString()}` : '-') : 'Exact'}
                    </div>
                  </div>
                  
                  <div className="flex-1 bg-slate-800/50 py-2 rounded border border-slate-700/50 text-slate-400">
                    <div className="text-[9px] uppercase tracking-wider mb-0.5 opacity-70">Change</div>
                    <div className={`font-mono font-bold text-sm ${changeDue < 0 ? 'text-slate-600' : 'text-green-400'}`}>
                      Rs.{Math.max(0, changeDue).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {['CASH', 'CARD', 'RAAST'].map(method => (
                    <button
                      key={method}
                      onClick={() => setActiveMethod(method as any)}
                      disabled={isProcessing}
                      className={`py-2 rounded font-bold tracking-wider text-[9px] transition-all border flex flex-col items-center justify-center gap-1
                        ${activeMethod === method 
                          ? 'bg-gold-500 text-black border-gold-500 shadow-sm' 
                          : 'bg-transparent text-slate-500 border-slate-700 hover:bg-slate-800'}
                      `}
                    >
                      {method === 'CASH' && '💵'}
                      {method === 'CARD' && <CreditCard size={14} />}
                      {method === 'RAAST' && <span className="font-serif italic font-black text-[12px]">R</span>}
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`flex-1 min-h-0 flex flex-col justify-center py-2 transition-all duration-300 ${activeMethod === 'CASH' ? 'opacity-100' : 'opacity-20 pointer-events-none'}`}>
                <div className="grid grid-cols-3 gap-1.5 w-full max-w-[240px] mx-auto h-full max-h-[220px]">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((key) => (
                    <button
                      key={key}
                      disabled={isProcessing}
                      onClick={() => handlePress(key.toString())}
                      className="w-full h-full rounded text-lg font-light text-white hover:bg-slate-800 active:bg-slate-700 bg-slate-800/30 border border-slate-700/50 flex items-center justify-center"
                    >
                      {key}
                    </button>
                  ))}
                  <button onClick={() => handlePress('00')} className="w-full h-full rounded text-sm font-bold text-white hover:bg-slate-800 bg-slate-800/30 border border-slate-700/50 flex items-center justify-center">00</button>
                  <button onClick={() => handlePress('0')} className="w-full h-full rounded text-lg font-light text-white hover:bg-slate-800 bg-slate-800/30 border border-slate-700/50 flex items-center justify-center">0</button>
                  <button onClick={() => handlePress('EXACT')} className="w-full h-full rounded text-[8px] font-bold uppercase text-gold-500 hover:bg-gold-500/10 border border-gold-500/30 bg-slate-800/30 flex items-center justify-center">Exact</button>
                </div>
              </div>

              <div className={`shrink-0 flex justify-center gap-4 mt-1 mb-2 ${activeMethod !== 'CASH' && 'opacity-0'}`}>
                   <button onClick={() => handlePress('CLR')} className="text-[9px] text-slate-500 hover:text-white uppercase tracking-wider py-1 px-3">Clear</button>
                   <button onClick={() => handlePress('DEL')} className="text-[9px] text-slate-500 hover:text-white uppercase tracking-wider py-1 px-3 flex items-center gap-1"><Delete size={10}/> Del</button>
              </div>

              <div className="shrink-0 mt-auto">
                <button 
                  onClick={handlePayment}
                  disabled={isProcessing || (activeMethod === 'CASH' && !isSufficient)}
                  className={`w-full h-12 rounded-xl text-xs font-bold uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2
                    ${isProcessing ? 'bg-slate-700 text-slate-300' : 
                      (activeMethod !== 'CASH' || isSufficient)
                       ? 'bg-green-600 text-white hover:bg-green-500 shadow-md'
                       : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'}
                  `}
                >
                  {isProcessing ? (
                    <><Loader2 size={16} className="animate-spin" /> Processing</>
                  ) : (
                    <>
                      {activeMethod === 'CASH' && !isSufficient ? 'Enter Amount' : 'Confirm & Save'}
                      {(activeMethod !== 'CASH' || isSufficient) && <ArrowRight size={16} />}
                    </>
                  )}
                </button>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 p-8 text-center">
               <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4 border border-slate-800">
                 <CreditCard className="w-8 h-8 opacity-50" />
               </div>
               <h2 className="text-white font-serif text-lg mb-1">POS Terminal</h2>
               <p className="text-xs max-w-[180px]">Select an order from the left list to begin payment.</p>
            </div>
          )}

          {showReceipt && receiptData && (
            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-[280px] shadow-2xl relative animate-in zoom-in duration-300">
                <div className="bg-slate-200 h-1.5 w-full" />
                <div className="p-4 pb-6 text-black font-mono text-[10px] leading-tight">
                  <div className="text-center mb-4">
                    <h2 className="text-base font-bold font-serif mb-0.5">FIREFLOW</h2>
                    <p className="uppercase tracking-widest text-gray-500 text-[8px]">Fine Dining</p>
                  </div>
                  <div className="border-b border-dashed border-gray-300 my-2" />
                  <div className="flex justify-between text-gray-500 mb-0.5">
                    <span>Date: {new Date().toLocaleDateString()}</span>
                    <span>#{(receiptData.id || '').split('-')[1] || '---'}</span>
                  </div>
                  <div className="border-b border-dashed border-gray-300 my-2" />
                  <div className="space-y-1 mb-2">
                    {(receiptData.items || []).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start">
                        <span className="max-w-[150px]">{item.quantity} x {item.menuItem.name}</span>
                        <span className="font-bold">
                          {((Number(item.menuItem.price) || 0) * (Number(item.quantity) || 0)).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="border-b border-dashed border-gray-300 my-2" />
                  <div className="flex justify-between text-sm font-bold mb-0.5">
                    <span>TOTAL</span>
                    <span>Rs.{(Number(receiptData.total) || 0).toLocaleString()}</span>
                  </div>
                  <div className="text-center mt-4">
                     <p className="uppercase tracking-widest text-[8px]">Thank You</p>
                  </div>
                </div>
                
                <button 
                  onClick={closeReceipt}
                  className="absolute -top-10 right-0 bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-full flex items-center gap-1"
                >
                  <span className="text-[10px] font-bold uppercase px-1">Close</span> <X size={16} />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
