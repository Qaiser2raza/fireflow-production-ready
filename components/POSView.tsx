
import React, { useState, useMemo, useEffect } from 'react';
import { MenuItem, OrderItem, OrderStatus, OrderType, Order, Transaction, TableStatus } from '../types';
import { useAppContext } from '../App';
import { Search, Flame, Save, Utensils, ShoppingBag, Truck, Phone, MapPin, X, Edit2, User, Users, History, AlertCircle, Plus, Minus, Trash2, Receipt, CheckCircle2, CreditCard, Loader2, Ban, MessageSquare, ChefHat, Percent, AlertTriangle, Clock, Printer, FileText, FileJson } from 'lucide-react';

const generateSensibleId = () => {
  const now = new Date();
  const timePart = now.getHours().toString().padStart(2, '0') + 
                  now.getMinutes().toString().padStart(2, '0') + 
                  now.getSeconds().toString().padStart(2, '0');
  const randomPart = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ORD-${timePart}-${randomPart}`;
};

export const POSView: React.FC = () => {
  const { addOrder, updateOrder, updateTableStatus, calculateOrderTotal, orders, orderToEdit, setOrderToEdit, processPayment, currentUser, menuItems, tables, addNotification, setActiveView } = useAppContext();
  
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showProForma, setShowProForma] = useState(false);
  const [itemNoteModal, setItemNoteModal] = useState<{index: number, note: string} | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [assignedWaiterId, setAssignedWaiterId] = useState<string | undefined>(undefined);
  const [currentOrderItems, setCurrentOrderItems] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('dine-in');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [guestCount, setGuestCount] = useState<number>(2);
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [customDeliveryFee, setCustomDeliveryFee] = useState<number>(250);

  const activeTable = useMemo(() => tables.find(t => t.id === selectedTableId), [tables, selectedTableId]);

  const { total, breakdown } = calculateOrderTotal(currentOrderItems, orderType, guestCount, customDeliveryFee);
  
  const hasDraftItems = currentOrderItems.some(i => i.status === OrderStatus.DRAFT);
  const isCommitted = currentOrderItems.length > 0 && !hasDraftItems;
  
  const isAllReady = currentOrderItems.length > 0 && currentOrderItems.every(i => 
    i.status === OrderStatus.READY || 
    i.status === OrderStatus.DELIVERED || 
    i.status === OrderStatus.PAID
  );
  
  const isCashier = currentUser?.role === 'CASHIER' || currentUser?.role === 'MANAGER' || currentUser?.role === 'SUPER_ADMIN';
  
  // DELIVERY GUARD: If it's a delivery order and it's already shipped, settlement happens in Dispatch
  const isLogisticsLocked = orderType === 'delivery' && activeOrderId && orders.find(o => o.id === activeOrderId && [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED].includes(o.status));
  
  const isWorkflowLocked = (orderType === 'dine-in' || orderType === 'takeaway') && !isAllReady;
  
  const canPrintBill = isCommitted && !isWorkflowLocked && isCashier;
  const canSettle = isCashier && isCommitted && !isWorkflowLocked && !isLogisticsLocked;

  const filteredItems = useMemo(() => {
    let items = menuItems || [];
    if (activeCategory !== 'all') items = items.filter(i => i.category === activeCategory);
    const safeSearchQuery = (searchQuery || '').toLowerCase();
    if (safeSearchQuery) items = items.filter(i => (i.name || '').toLowerCase().includes(safeSearchQuery));
    return items;
  }, [activeCategory, searchQuery, menuItems]);

  const resetPad = () => {
    setActiveOrderId(null); setCurrentOrderItems([]); setCustomerPhone(''); setCustomerName(''); setDeliveryAddress('');
    setOrderType(currentUser?.role === 'CASHIER' ? 'takeaway' : 'dine-in'); setSelectedTableId(''); setGuestCount(2); setAssignedWaiterId(undefined); setIsSubmitting(false);
  };

  const loadOrder = (order: Order) => {
    if (order.id === 'NEW_FROM_FLOOR') {
      setActiveOrderId(null); setCurrentOrderItems([]); setOrderType('dine-in'); setSelectedTableId(order.tableId || ''); setGuestCount(order.guestCount || 2); setAssignedWaiterId(order.assignedWaiterId);
    } else {
      setActiveOrderId(order.id); setCurrentOrderItems((order.items || []).map(i => ({...i}))); setOrderType(order.type); setSelectedTableId(order.tableId || ''); setGuestCount(order.guestCount || 2); setCustomerName(order.customerName || ''); setCustomerPhone(order.customerPhone || ''); setDeliveryAddress(order.deliveryAddress || ''); setAssignedWaiterId(order.assignedWaiterId);
    }
    setShowRecallModal(false);
  };

  useEffect(() => { if (orderToEdit) { loadOrder(orderToEdit); setOrderToEdit(null); } }, [orderToEdit]);

  const addToOrder = (item: MenuItem) => {
    if (!item.available) return;
    setCurrentOrderItems(prev => {
      const existingIndex = prev.findIndex(i => i.menuItem.id === item.id && i.status === OrderStatus.DRAFT);
      if (existingIndex >= 0) {
        const newItems = [...prev];
        newItems[existingIndex] = { ...newItems[existingIndex], quantity: newItems[existingIndex].quantity + 1 };
        return newItems;
      }
      return [...prev, { menuItem: item, quantity: 1, status: OrderStatus.DRAFT }];
    });
  };

  const adjustQuantity = (index: number, delta: number) => {
    setCurrentOrderItems(prev => {
      const newItems = [...prev];
      if (newItems[index] && newItems[index].status === OrderStatus.DRAFT) {
        const newQty = Math.max(1, newItems[index].quantity + delta);
        newItems[index] = { ...newItems[index], quantity: newQty };
      }
      return newItems;
    });
  };

  const removeFromOrder = (index: number) => setCurrentOrderItems(prev => prev.filter((_, i) => i !== index));

  const handleOrderAction = async (targetStatus: OrderStatus) => {
    if (currentOrderItems.length === 0 || isSubmitting) return;

    if (orderType === 'delivery' && !customerPhone) {
      addNotification('error', "LOGISTICS GUARD: Phone number required for Delivery traceability.");
      setShowDetailsModal(true);
      return;
    }

    if (orderType === 'dine-in' && !selectedTableId) { 
      setShowDetailsModal(true); 
      return; 
    }

    setIsSubmitting(true);

    const finalItems = currentOrderItems.map(item => {
      if (targetStatus === OrderStatus.NEW && item.status === OrderStatus.DRAFT) {
        return { ...item, status: OrderStatus.NEW };
      }
      return item;
    });

    const orderData: Order = {
      id: activeOrderId || generateSensibleId(),
      status: targetStatus === OrderStatus.DRAFT ? OrderStatus.DRAFT : targetStatus, 
      timestamp: activeOrderId ? (orders.find(o => o.id === activeOrderId)?.timestamp || new Date()) : new Date(),
      type: orderType,
      items: finalItems,
      total,
      breakdown,
      tableId: orderType === 'dine-in' ? selectedTableId : undefined,
      guestCount: orderType === 'dine-in' ? guestCount : undefined,
      customerPhone: customerPhone || undefined,
      customerName: customerName || (orderType === 'takeaway' ? 'Walk-in' : undefined),
      assignedWaiterId: assignedWaiterId || currentUser?.id,
      deliveryFee: orderType === 'delivery' ? customDeliveryFee : undefined,
      deliveryAddress: orderType === 'delivery' ? deliveryAddress : undefined
    };

    try {
      const isExistingOrder = activeOrderId && orders.some(o => o.id === activeOrderId);
      let success = false;
      if (isExistingOrder) success = await updateOrder(orderData);
      else success = await addOrder(orderData);
      
      if (success) {
        if (targetStatus === OrderStatus.READY && orderType === 'dine-in' && selectedTableId) {
          await updateTableStatus(selectedTableId, TableStatus.PAYMENT_PENDING, undefined, orderData.id);
          setShowProForma(true);
        } else {
          resetPad();
        }
      } 
    } catch (err) { } finally { setIsSubmitting(false); }
  };

  return (
    <div className="flex h-full w-full bg-slate-950 relative flex-col md:flex-row overflow-hidden">
      <div className="flex-1 p-6 flex flex-col gap-6 overflow-hidden">
        <div className="flex items-center gap-4 bg-slate-900/80 p-3 rounded-lg border border-slate-800">
          <Search className="text-slate-500" size={20} />
          <input type="text" placeholder="SEARCH MENU..." className="bg-transparent outline-none text-slate-300 placeholder-slate-600 uppercase tracking-widest text-sm w-full font-medium" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {['all', 'starters', 'mains', 'beverages', 'desserts'].map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-6 py-2 rounded-full text-xs font-bold tracking-widest uppercase transition-all border shrink-0 ${activeCategory === cat ? 'bg-gold-500 text-slate-950 border-gold-500 shadow-lg' : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-gold-400'}`}>{cat}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 overflow-y-auto pb-20 custom-scrollbar">
          {filteredItems.map(item => (
            <div key={item.id} onClick={() => addToOrder(item)} className={`group relative h-48 rounded-xl overflow-hidden border transition-all duration-300 ${!item.available ? 'opacity-70 border-red-900/50 grayscale cursor-not-allowed' : 'border-slate-800 hover:border-gold-500/50 cursor-pointer bg-slate-900'}`}>
              {item.image && <img src={item.image} alt={item.name} className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity" />}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent z-20">
                <h3 className="font-bold text-sm text-white truncate">{item.name}</h3>
                <span className="text-gold-400 font-serif font-bold text-xs">Rs. {item.price}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="md:w-96 bg-slate-900 flex flex-col shadow-2xl border-l border-slate-800 shrink-0">
        <div className="p-4 border-b border-slate-800 bg-slate-900 space-y-3">
          <div className="flex justify-between items-center">
            <h1 className="text-white text-lg font-serif">{activeOrderId ? `#${activeOrderId.split('-').pop()}` : 'New Session'}</h1>
            <div className="flex gap-2">
              <button onClick={() => setShowRecallModal(true)} className="text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 px-3 py-1.5 rounded flex items-center justify-center gap-2 border border-slate-700 hover:bg-slate-700 transition-all"><History size={12} /> Recall</button>
              {(activeOrderId || currentOrderItems.length > 0) && <button onClick={resetPad} className="text-[10px] font-bold uppercase tracking-wider bg-red-900/20 text-red-500 px-2 py-1.5 rounded flex items-center justify-center border border-red-900/30 hover:bg-red-600 hover:text-white transition-all"><X size={12}/></button>}
            </div>
          </div>
          <button onClick={() => setShowDetailsModal(true)} className="w-full border border-slate-700 bg-slate-800/50 rounded-lg p-3 flex items-center justify-between group transition-all">
             <div className="text-left flex items-center gap-3">
               <div className="p-2 bg-slate-900 rounded-full text-gold-500 group-hover:text-gold-400">
                {orderType === 'dine-in' && <Utensils size={14} />}
                {orderType === 'takeaway' && <ShoppingBag size={14} />}
                {orderType === 'delivery' && <Truck size={14} />}
               </div>
               <div><div className="text-[10px] text-slate-500 uppercase font-black">{orderType}</div><div className="text-sm text-slate-200 truncate w-40">{orderType === 'dine-in' ? (activeTable ? `${activeTable.name} (${guestCount}p)` : 'Select Table') : customerPhone || 'Walk-in'}</div></div>
             </div>
             <Edit2 size={14} className="text-slate-500 group-hover:text-gold-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
           {currentOrderItems.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-slate-700 space-y-4 pt-20"><ShoppingBag size={48} className="opacity-10" /><span className="text-sm font-black uppercase tracking-[0.4em]">Cart is Empty</span></div>
           ) : (
             <div className="space-y-4">
                {currentOrderItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start py-2 border-b border-slate-800/30 group">
                    <div className="flex gap-3">
                      {item.status === OrderStatus.DRAFT ? (
                        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden h-8">
                           <button onClick={() => adjustQuantity(idx, -1)} className="px-2 hover:bg-slate-800 text-gold-500"><Minus size={12}/></button>
                           <span className="px-2 text-white font-mono font-bold text-xs">{item.quantity}</span>
                           <button onClick={() => adjustQuantity(idx, 1)} className="px-2 hover:bg-slate-800 text-gold-500"><Plus size={12}/></button>
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded bg-slate-800 flex items-center justify-center text-xs font-black text-slate-500">{item.quantity}</div>
                      )}
                      <div>
                        <div className="text-slate-200 text-sm font-medium">{item.menuItem.name}</div>
                        <span className={`text-[9px] uppercase font-black tracking-widest ${item.status === OrderStatus.DRAFT ? 'text-gold-500/60' : 'text-slate-600'}`}>{item.status}</span>
                      </div>
                    </div>
                    <div className="text-right">
                       <div className="text-slate-200 font-mono text-sm">{(item.menuItem.price * item.quantity).toLocaleString()}</div>
                       {item.status === OrderStatus.DRAFT && (
                         <button onClick={() => removeFromOrder(idx)} className="text-red-500/30 hover:text-red-500 transition-colors p-1"><Trash2 size={14}/></button>
                       )}
                    </div>
                  </div>
                ))}
             </div>
           )}
        </div>

        <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-4">
          <div className="flex justify-between items-end border-b border-slate-800/50 pb-3"><span className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Sub-Total</span><span className="text-2xl font-serif text-white font-bold">Rs. {total.toLocaleString()}</span></div>
          
          <div className="grid grid-cols-2 gap-3">
            {hasDraftItems ? (
              <>
                <button onClick={() => handleOrderAction(OrderStatus.DRAFT)} disabled={isSubmitting} className="h-14 bg-slate-800 text-slate-300 border border-slate-700 rounded-xl font-black text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-slate-700 transition-all">
                  {isSubmitting ? <Loader2 className="animate-spin" size={16}/> : <><FileJson size={16}/> SAVE DRAFT</>}
                </button>
                <button onClick={() => handleOrderAction(OrderStatus.NEW)} disabled={isSubmitting} className="h-14 bg-gold-500 text-slate-950 rounded-xl font-black text-[10px] tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-gold-400 transition-all">
                  {isSubmitting ? <Loader2 className="animate-spin" size={16}/> : <><Flame size={16}/> FIRE TO KDS</>}
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => handleOrderAction(OrderStatus.READY)} 
                  disabled={!canPrintBill || isSubmitting}
                  className={`h-14 rounded-xl font-black text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all 
                    ${canPrintBill ? 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-slate-900 border border-slate-800 text-slate-700 opacity-50 cursor-not-allowed'}`}
                >
                  <Printer size={16}/> {isSubmitting ? 'SECURE...' : isWorkflowLocked ? 'LOCKED (KDS)' : 'PRINT PRO-FORMA'}
                </button>
                <button 
                  onClick={() => isLogisticsLocked ? setActiveView('dispatch') : setShowPaymentModal(true)} 
                  disabled={(!canSettle && !isLogisticsLocked) || isSubmitting}
                  className={`h-14 rounded-xl font-black text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all 
                    ${(canSettle || isLogisticsLocked) ? 'bg-green-600 text-white shadow-xl animate-pulse' : 'bg-slate-800 text-slate-600 border border-slate-700 opacity-50 cursor-not-allowed'}`}
                >
                  <Receipt size={16}/> {isLogisticsLocked ? 'GOTO DISPATCH' : isWorkflowLocked ? 'PENDING KDS' : 'SETTLE & CLOSE'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {showDetailsModal && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4">
           <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300">
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                 <h2 className="text-white font-serif text-xl font-bold uppercase tracking-wider flex items-center gap-3">
                   <Edit2 size={18} className="text-gold-500" />
                   Topology Setup
                 </h2>
                 <button onClick={() => setShowDetailsModal(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 hover:text-white transition-colors">
                   <X size={24} />
                 </button>
              </div>
              
              <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh] custom-scrollbar">
                 <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 block">Service Protocol</label>
                    <div className="flex gap-2 p-1 bg-slate-950 border border-slate-800 rounded-2xl">
                       {[
                         { id: 'dine-in', icon: <Utensils size={14}/>, label: 'Dine-In' },
                         { id: 'takeaway', icon: <ShoppingBag size={14}/>, label: 'Takeaway' },
                         { id: 'delivery', icon: <Truck size={14}/>, label: 'Delivery' }
                       ].map(t => (
                         <button 
                           key={t.id} 
                           onClick={() => setOrderType(t.id as OrderType)}
                           className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all
                             ${orderType === t.id ? 'bg-gold-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-slate-300'}
                           `}
                         >
                           {t.icon} {t.label}
                         </button>
                       ))}
                    </div>
                 </div>

                 {orderType === 'dine-in' && (
                    <div className="space-y-6 animate-in slide-in-from-top-2">
                       <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 block">Select Table Asset</label>
                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                             {tables.sort((a,b) => a.name.localeCompare(b.name)).map(t => {
                               const isOccupiedByOther = t.status !== TableStatus.AVAILABLE && t.activeOrderId !== activeOrderId;
                               return (
                                 <button
                                   key={t.id}
                                   disabled={isOccupiedByOther}
                                   onClick={() => setSelectedTableId(t.id)}
                                   className={`h-12 rounded-xl border-2 font-mono text-sm font-bold flex items-center justify-center transition-all
                                     ${selectedTableId === t.id 
                                       ? 'bg-gold-500 border-gold-500 text-slate-950 shadow-lg shadow-gold-500/20' 
                                       : isOccupiedByOther
                                          ? 'bg-slate-950 border-red-900/50 text-red-900 opacity-40 cursor-not-allowed'
                                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-gold-500/50 hover:text-white'}
                                   `}
                                 >
                                   {t.name}
                                 </button>
                               );
                             })}
                          </div>
                       </div>
                       
                       <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 block">Guest Count</label>
                          <div className="flex items-center gap-4 bg-slate-950 p-2 border border-slate-800 rounded-2xl w-fit">
                             <button onClick={() => setGuestCount(Math.max(1, guestCount - 1))} className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white hover:bg-slate-800"><Minus size={16}/></button>
                             <span className="w-12 text-center text-xl font-bold text-white font-serif">{guestCount}</span>
                             <button onClick={() => setGuestCount(guestCount + 1)} className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white hover:bg-slate-800"><Plus size={16}/></button>
                          </div>
                       </div>
                    </div>
                 )}

                 {(orderType === 'takeaway' || orderType === 'delivery') && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1 block">Customer Name</label>
                          <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-gold-500" placeholder="e.g. Ali Khan" />
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1 block">Contact Phone {orderType === 'delivery' && <span className="text-red-500">*</span>}</label>
                          <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-gold-500 font-mono" placeholder="0300-0000000" />
                       </div>
                    </div>
                 )}

                 {orderType === 'delivery' && (
                    <div className="space-y-6 animate-in slide-in-from-top-2">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1 block">Navigation Address</label>
                          <textarea value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-gold-500 h-24 resize-none" placeholder="House #, Street, Area..." />
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1 block">Logistics Surcharge (PKR)</label>
                          <input type="number" value={customDeliveryFee} onChange={e => setCustomDeliveryFee(Number(e.target.value))} className="w-48 bg-slate-950 border border-slate-800 rounded-xl p-3 text-white outline-none focus:border-gold-500 font-mono font-bold" />
                       </div>
                    </div>
                 )}
              </div>

              <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/30">
                 <button onClick={() => setShowDetailsModal(false)} className="px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Discard</button>
                 <button onClick={() => setShowDetailsModal(false)} className="px-8 py-3 bg-gold-500 text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-gold-500/10 active:scale-95 transition-all">Confirm Protocol</button>
              </div>
           </div>
        </div>
      )}

      {/* Pro Forma Receipt View */}
      {showProForma && (
        <div className="fixed inset-0 z-[120] bg-black/95 backdrop-blur flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-sm rounded-lg p-8 text-black font-mono text-sm relative animate-in zoom-in duration-300">
              <div className="text-center mb-6">
                 <h2 className="text-xl font-serif font-black mb-1">FIREFLOW</h2>
                 <p className="text-[10px] uppercase tracking-widest">Reception Check • Pro-forma</p>
              </div>
              <div className="border-b border-dashed border-slate-300 my-4" />
              <div className="flex justify-between mb-1"><span>Server:</span><span>{currentUser?.name}</span></div>
              <div className="flex justify-between mb-1"><span>Table:</span><span>{activeTable?.name || 'Walk-in'}</span></div>
              <div className="flex justify-between mb-1"><span>Guests:</span><span>{guestCount}</span></div>
              <div className="border-b border-dashed border-slate-300 my-4" />
              <div className="space-y-2 mb-6">
                 {currentOrderItems.map((i, idx) => (
                    <div key={idx} className="flex justify-between">
                       <span>{i.quantity} x {i.menuItem.name}</span>
                       <span>{(i.menuItem.price * i.quantity).toLocaleString()}</span>
                    </div>
                 ))}
              </div>
              <div className="border-b border-dashed border-slate-300 my-4" />
              <div className="flex justify-between font-black text-lg"><span>TOTAL</span><span>Rs. {total.toLocaleString()}</span></div>
              <div className="mt-10 text-center text-[10px] text-slate-400">WAITING FOR SETTLEMENT</div>
              <button onClick={() => { setShowProForma(false); resetPad(); }} className="mt-8 w-full py-4 bg-slate-900 text-white rounded font-black uppercase text-xs">Close & Return to POS</button>
           </div>
        </div>
      )}

      {showRecallModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8">
           <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl h-[70vh] rounded-[2rem] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10">
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                <h2 className="text-white font-serif text-xl flex items-center gap-3"><History size={20} className="text-gold-500" /> Open Sessions Log</h2>
                <button onClick={() => setShowRecallModal(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 hover:text-white transition-colors"><X size={24} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-[#020617] custom-scrollbar">
                {orders.filter(o => !['PAID', 'CANCELLED', 'VOID'].includes(o.status)).length === 0 ? (
                  <div className="col-span-full text-center text-slate-600 py-20 uppercase font-black tracking-widest text-sm">No active tickets available</div>
                ) : (
                  orders.filter(o => !['PAID', 'CANCELLED', 'VOID'].includes(o.status)).sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime()).map(order => {
                    const tbl = tables.find(t => t.id === order.tableId || t.name === order.tableId);
                    return (
                      <button key={order.id} onClick={() => loadOrder(order)} className={`text-left p-6 rounded-[2rem] border transition-all relative group overflow-hidden ${order.status === OrderStatus.DRAFT ? 'bg-slate-900/50 border-gold-500/20 shadow-lg shadow-gold-500/5' : 'bg-slate-900 border-slate-800 hover:border-gold-500/50 hover:bg-slate-800'}`}>
                         <div className="flex justify-between items-start mb-4">
                            <div>
                               <span className="text-white text-xl font-serif font-bold block">{tbl?.name || order.customerName || 'Walk-in'}</span>
                               <span className="text-[9px] text-slate-500 font-black tracking-[0.2em] uppercase mt-1 block">{order.type}</span>
                            </div>
                            <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase border ${order.status === OrderStatus.DRAFT ? 'bg-gold-500/10 border-gold-500/20 text-gold-500' : 'bg-green-500/10 border-green-500/20 text-green-500'}`}>{order.status}</span>
                         </div>
                         <div className="flex justify-between items-end border-t border-slate-800/50 pt-4">
                            <div className="text-slate-500 text-[9px] font-black uppercase tracking-widest">{order.items.length} Production Units</div>
                            <div className="text-gold-500 font-mono font-bold text-lg">Rs. {order.total.toLocaleString()}</div>
                         </div>
                      </button>
                    );
                  })
                )}
              </div>
           </div>
        </div>
      )}
      {showPaymentModal && activeOrderId && (<PaymentModal total={total} orderId={activeOrderId} currentOrderItems={currentOrderItems} onClose={() => setShowPaymentModal(false)} onSuccess={() => { resetPad(); setShowPaymentModal(false); }} processPayment={processPayment} />)}
    </div>
  );
};

const PaymentModal: React.FC<any> = ({ total, onClose, onSuccess, processPayment, orderId, currentOrderItems }) => {
  const { currentUser } = useAppContext();
  const [tendered, setTendered] = useState('');
  const [method, setMethod] = useState<'CASH' | 'CARD' | 'RAAST'>('CASH');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showFinalReceipt, setShowFinalReceipt] = useState(false);
  const tenderedVal = parseInt(tendered) || 0;
  const change = tenderedVal - total;
  const isSufficient = tenderedVal >= total;
  
  useEffect(() => { if (method !== 'CASH') setTendered(total.toString()); else setTendered(''); }, [method, total]);
  
  const handlePay = async () => {
    if (method === 'CASH' && !isSufficient) return;
    setIsProcessing(true);
    const success = await processPayment(orderId, { id: `TXN-${Math.random().toString(36).substring(2, 9).toUpperCase()}`, orderId, amount: total, method, timestamp: new Date(), processedBy: currentUser?.name || 'Reception' });
    setIsProcessing(false);
    if (success) setShowFinalReceipt(true);
  };

  if (showFinalReceipt) {
    return (
      <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4">
         <div className="bg-white w-full max-w-sm p-8 text-black font-mono shadow-2xl rounded animate-in zoom-in duration-300">
            <div className="text-center mb-6">
               <h2 className="text-2xl font-serif font-black">PAID INVOICE</h2>
               <div className="bg-black text-white px-2 py-0.5 inline-block text-[10px] font-bold mt-2">VAT ZERO-RATED</div>
            </div>
            <div className="border-b border-dashed border-slate-300 my-4" />
            <div className="flex justify-between"><span>Inv #:</span><span>{orderId.split('-')[1]}</span></div>
            <div className="flex justify-between"><span>Method:</span><span>{method}</span></div>
            <div className="flex justify-between"><span>Date:</span><span>{new Date().toLocaleDateString()}</span></div>
            <div className="border-b border-dashed border-slate-300 my-4" />
            <div className="space-y-1 text-xs">
               {currentOrderItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between">
                     <span>{item.quantity} x {item.menuItem.name}</span>
                     <span>{(item.menuItem.price * item.quantity).toLocaleString()}</span>
                  </div>
               ))}
            </div>
            <div className="border-b border-dashed border-slate-300 my-4" />
            <div className="flex justify-between font-black text-xl"><span>TOTAL PAID</span><span>Rs. {total.toLocaleString()}</span></div>
            {method === 'CASH' && (
               <div className="text-[10px] text-slate-500 mt-2">
                  <div className="flex justify-between"><span>Tendered:</span><span>Rs. {tenderedVal.toLocaleString()}</span></div>
                  <div className="flex justify-between font-bold text-black"><span>Change:</span><span>Rs. {change.toLocaleString()}</span></div>
               </div>
            )}
            <div className="mt-8 pt-4 border-t border-slate-200 text-center">
               <div className="bg-slate-100 p-3 rounded mb-4 flex items-center justify-center gap-2">
                  <CheckCircle2 className="text-green-600" size={20}/>
                  <span className="text-[10px] font-black uppercase tracking-widest">Transaction Verified</span>
               </div>
               <button onClick={onSuccess} className="w-full py-4 bg-slate-900 text-white font-black uppercase text-xs flex items-center justify-center gap-2">
                  <Printer size={16}/> Print & Close Pad
               </button>
            </div>
         </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur flex items-center justify-center p-4">
       <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl min-h-[500px] rounded-[2.5rem] shadow-2xl flex overflow-hidden">
          <div className="w-1/3 bg-slate-950 p-8 flex flex-col border-r border-slate-800">
             <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-slate-500 hover:text-white"><X size={24} /></button>
             <div className="mt-10 text-center">
                <div className="text-[10px] text-slate-600 uppercase font-black tracking-[0.2em] mb-2">Settle Balance</div>
                <div className="text-4xl font-serif font-bold text-white">Rs. {total.toLocaleString()}</div>
             </div>
             <div className="mt-10 flex-1 overflow-y-auto space-y-4 no-scrollbar">
                {currentOrderItems.map((i: any, idx: number) => <div key={idx} className="flex justify-between text-xs text-slate-500"><span>{i.quantity}x {i.menuItem.name}</span><span>{(i.menuItem.price * i.quantity).toLocaleString()}</span></div>)}
             </div>
          </div>
          <div className="flex-1 p-10 flex flex-col items-center justify-center space-y-10">
             <div className="flex gap-4">
                {['CASH', 'CARD', 'RAAST'].map(m => (<button key={m} onClick={() => setMethod(m as any)} className={`px-8 py-4 rounded-2xl border transition-all font-black text-xs uppercase tracking-widest ${method === m ? 'bg-gold-500 text-slate-950 border-gold-500 shadow-xl' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'}`}>{m}</button>))}
             </div>
             <div className={`w-full max-w-xs space-y-6 transition-all ${method !== 'CASH' ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
                <div className="flex justify-between">
                   <div className="text-center">
                      <div className="text-[10px] text-slate-600 font-black uppercase mb-1">Tendered</div>
                      <div className="text-2xl font-mono text-white font-bold">{tendered ? `Rs. ${parseInt(tendered).toLocaleString()}` : '-'}</div>
                   </div>
                   <div className="text-center">
                      <div className="text-[10px] text-slate-600 font-black uppercase mb-1">Change</div>
                      <div className={`text-2xl font-mono font-bold ${change < 0 ? 'text-slate-800' : 'text-green-500'}`}>Rs. {Math.max(0, change).toLocaleString()}</div>
                   </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                   {[1,2,3,4,5,6,7,8,9].map(k => <button key={k} onClick={()=>setTendered(prev=>prev+k)} className="h-14 rounded-xl bg-slate-800 text-white text-xl font-light hover:bg-slate-700 transition-colors">{k}</button>)}
                   <button onClick={()=>setTendered('')} className="h-14 text-slate-600 uppercase font-black text-[10px]">Clear</button>
                   <button key={0} onClick={()=>setTendered(prev=>prev+'0')} className="h-14 rounded-xl bg-slate-800 text-white text-xl font-light hover:bg-slate-700 transition-colors">0</button>
                   <button onClick={()=>setTendered(total.toString())} className="h-14 border border-gold-500/20 text-gold-500 uppercase font-black text-[10px] rounded-xl">Exact</button>
                </div>
             </div>
             <button onClick={handlePay} disabled={isProcessing || (method === 'CASH' && !isSufficient)} className={`w-full max-sm:h-16 h-16 rounded-2xl font-black uppercase tracking-[0.3em] text-sm transition-all ${isProcessing ? 'bg-slate-800' : (method !== 'CASH' || isSufficient) ? 'bg-green-600 text-white shadow-xl hover:bg-green-500' : 'bg-slate-800 text-slate-700'}`}>
                {isProcessing ? <Loader2 className="animate-spin mx-auto" /> : 'Finalize & Record Transaction'}
             </button>
          </div>
       </div>
    </div>
  );
};
