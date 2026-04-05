import React, { useState, useMemo, useEffect } from 'react';
import { MenuItem, OrderItem, OrderType, OrderStatus } from '../../shared/types';
import { useAppContext } from '../../client/contexts/AppContext';
import { useRestaurant } from '../../client/RestaurantContext';
import { 
  Search, X, Plus, Minus, Loader2, 
  ChevronDown, History, ShoppingBag, Bike, Utensils,
  CheckCircle2, Flame, ShoppingCart, Map as MapIcon, ArrowLeft
} from 'lucide-react';
import { RecallModal } from '../dashboard/components/RecallModal';
import { TokenDisplayBanner } from './components/TokenDisplayBanner';
import { useThermalPrinter } from '../../hooks/useThermalPrinter';

export const POSViewMobile: React.FC = () => {
  const {
    addOrder, updateOrder, fireOrder, calculateOrderTotal, orders,
    currentUser, menuItems, menuCategories,
    tables, addNotification, orderToEdit, setOrderToEdit,
    customers, addCustomer, setActiveView
  } = useAppContext();

  const { currentRestaurant } = useRestaurant();

  // UI State
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showOrderOptions, setShowOrderOptions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecallOpen, setIsRecallOpen] = useState(false);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | 'top'>('top');
  const [lastScrollTop, setLastScrollTop] = useState(0);
  
  // New Store Model UI States
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Order State
  const [currentOrderItems, setCurrentOrderItems] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>(currentUser?.role === 'CASHIER' ? 'TAKEAWAY' : 'DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [guestCount, setGuestCount] = useState<number>(2);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeOrderNumber, setActiveOrderNumber] = useState<string | null>(null);
  const [showTokenBanner, setShowTokenBanner] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [estimatedPickupTime, setEstimatedPickupTime] = useState<Date | undefined>(undefined);

  // Global Barcode Listener (Mobile)
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 100) buffer = '';
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (buffer.length > 5) {
          const scanned = buffer.trim();
          const foundry = orders.find(o => o.order_number === scanned || o.id === scanned);
          if (foundry) {
            setOrderToEdit(foundry);
            addNotification('success', `Recalled: ${foundry.order_number || scanned}`);
          }
        }
        buffer = '';
        return;
      }
      if (e.key.length === 1 && /[a-zA-Z0-9-]/.test(e.key)) buffer += e.key;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orders, setOrderToEdit, addNotification]);

  // Sync with orderToEdit
  useEffect(() => {
    if (orderToEdit) {
      setActiveOrderId(orderToEdit.id);
      setCurrentOrderItems(orderToEdit.order_items || []);
      setOrderType(orderToEdit.type || 'DINE_IN');
      setSelectedTableId(orderToEdit.table_id || '');
      setGuestCount(orderToEdit.guest_count || 2);
      setCustomerPhone(orderToEdit.customer_phone || '');
      setCustomerName(orderToEdit.customer_name || '');
      setDeliveryAddress(orderToEdit.delivery_address || '');
      setIsSearchVisible(false);
      setSearchQuery('');
      setIsCartOpen(false); // Make sure cart resets
    }
  }, [orderToEdit]);

  // Scroll Listener
  useEffect(() => {
    const handleScroll = (e: any) => {
      const container = e.target;
      if (!container || container === window) return;
      const st = container.scrollTop;
      if (st <= 10) setScrollDirection('top');
      else if (st > lastScrollTop && st > 50) setScrollDirection('down');
      else if (st < lastScrollTop) setScrollDirection('up');
      setLastScrollTop(st <= 0 ? 0 : st);
    };
    const scrollContainer = document.getElementById('mobile-pos-scroll-container');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, [lastScrollTop]);

  const activeOrderData = useMemo(() => orders?.find(o => o.id === activeOrderId), [orders, activeOrderId]);
  const isReadOnly = activeOrderData?.status === OrderStatus.CLOSED;

  // Live Sync
  useEffect(() => {
    if (activeOrderId && activeOrderData?.order_items) {
      setCurrentOrderItems(prev => {
        return prev.map(localItem => {
          const serverItem = activeOrderData.order_items!.find(si => si.id === localItem.id);
          if (serverItem) {
            return { 
              ...localItem, 
              item_status: serverItem.item_status,
              quantity: serverItem.quantity,
              total_price: serverItem.total_price
            };
          }
          return localItem;
        });
      });
    }
  }, [activeOrderData?.order_items]);

  const handleServeItem = async (itemId: string) => {
    if (!activeOrderId || !activeOrderData) return;
    setIsSubmitting(true);
    try {
      const updatedItems = currentOrderItems.map(i => 
        i.id === itemId ? { ...i, item_status: 'SERVED' } : i
      );
      const allServed = updatedItems.every(i => ['SERVED', 'VOIDED', 'CANCELLED', 'SKIPPED'].includes(i.item_status || ''));
      
      await updateOrder({
        id: activeOrderId,
        items: updatedItems,
        status: allServed ? 'READY' : 'ACTIVE',
        last_action_desc: 'Item served via mobile'
      } as any);
      
      addNotification('success', 'Served!');
    } catch (e) {
      addNotification('error', 'Update Failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Categories & Filtering
  const allCategories = useMemo(() => {
    const categories: { id: string; name: string; priority?: number }[] = [];
    const seenNames = new Set<string>();
    menuCategories?.forEach(c => {
      const nameLower = c.name.toLowerCase().trim();
      if (!seenNames.has(nameLower)) {
        categories.push({ id: c.id, name: c.name, priority: c.priority } as any);
        seenNames.add(nameLower);
      }
    });
    menuItems?.forEach(i => {
      if (i.category) {
        const nameLower = i.category.toLowerCase().trim();
        if (!seenNames.has(nameLower)) {
          categories.push({ id: i.category, name: i.category, priority: 99 } as any);
          seenNames.add(nameLower);
        }
      }
    });
    return categories.sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }, [menuCategories, menuItems]);

  const filteredItems = useMemo(() => {
    let items = Array.isArray(menuItems) ? menuItems : [];
    if (activeCategory && activeCategory !== 'all') {
      items = items.filter(i => i.category === activeCategory || i.category_id === activeCategory);
    }
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      items = items.filter(i => (i.name || '').toLowerCase().includes(q) || (i.name_urdu || '').includes(q));
    }
    return items;
  }, [menuItems, activeCategory, searchQuery]);

  const breakdown = useMemo(() => {
    const defaultBreakdown = { subtotal: 0, total: 0 };
    if (typeof calculateOrderTotal !== 'function') return defaultBreakdown;
    const result = calculateOrderTotal(currentOrderItems, orderType, guestCount, 0);
    return { subtotal: result?.subtotal || 0, total: result?.total || 0 };
  }, [currentOrderItems, orderType, guestCount, calculateOrderTotal]);

  const addToOrder = (item: MenuItem) => {
    if (isReadOnly) return;
    setCurrentOrderItems(prev => {
      const existingInDraft = prev.findIndex(i => i.menu_item_id === item.id && i.item_status === 'DRAFT');
      if (existingInDraft !== -1) {
        const newItems = [...prev];
        newItems[existingInDraft] = { ...newItems[existingInDraft], quantity: newItems[existingInDraft].quantity + 1 };
        return newItems;
      }
      return [{
        id: `m-${Date.now()}`,
        menu_item_id: item.id,
        item_name: item.name,
        quantity: 1,
        item_status: 'DRAFT',
        unit_price: item.price,
        total_price: item.price,
        category: item.category,
        station: item.station,
        station_id: item.station_id
      } as any, ...prev];
    });
  };

  const updateQuantity = (menuItemId: string, delta: number) => {
    if (isReadOnly) return;
    setCurrentOrderItems(prev => {
      const index = prev.findIndex(i => i.menu_item_id === menuItemId && i.item_status === 'DRAFT');
      if (index === -1) return prev;
      const newItems = [...prev];
      const newQty = newItems[index].quantity + delta;
      if (newQty <= 0) return newItems.filter((_, i) => i !== index);
      newItems[index] = { ...newItems[index], quantity: newQty };
      return newItems;
    });
  };

  const handleOrderAction = async (shouldFire: boolean = false) => {
    if (currentOrderItems.length === 0) return;
    if (orderType === 'DINE_IN' && !selectedTableId) {
      addNotification('info', 'Please select a table.');
      return;
    }
    try {
      setIsSubmitting(true);
      
      if ((orderType === 'DELIVERY' || orderType === 'TAKEAWAY') && customerPhone && customerName) {
        const existing = customers?.find(c => (c.phone || '').replace(/\D/g, '') === customerPhone.replace(/\D/g, ''));
        if (!existing) {
          await addCustomer({
            name: customerName,
            phone: customerPhone,
            address: deliveryAddress,
            restaurant_id: currentUser?.restaurant_id
          } as any);
        }
      }

      const itemsToSubmit = currentOrderItems.map(item => {
        if (shouldFire && item.item_status === 'DRAFT') return { ...item, item_status: 'PENDING' };
        return item;
      });
      const orderPayload = {
        id: activeOrderId || undefined,
        order_number: `ORD-${Date.now()}`,
        type: orderType,
        status: OrderStatus.ACTIVE,
        order_items: itemsToSubmit,
        table_id: selectedTableId || undefined,
        customer_phone: customerPhone || undefined,
        customer_name: customerName || undefined,
        delivery_address: deliveryAddress || undefined,
        guest_count: guestCount,
        total: breakdown.total,
        restaurant_id: currentUser?.restaurant_id
      } as any;
      
      const result = await (activeOrderId ? updateOrder(orderPayload) : addOrder(orderPayload));
      
      if (result) {
        if (!activeOrderId && result.id) setActiveOrderId(result.id);
        if (shouldFire) await fireOrder(result.id, orderType);
      }
      
      addNotification('success', shouldFire ? 'Sent to Kitchen' : 'Order Saved');
      setIsCartOpen(false); // Close cart on successful submit
      
      if (shouldFire && (orderType === 'TAKEAWAY' || orderType === 'DELIVERY')) {
          const backendToken = (result as any).takeaway_orders?.[0]?.token_number || (result as any).takeaway_orders?.token_number;
          const token = backendToken || Math.floor(1000 + Math.random() * 9000).toString();
          
          setActiveOrderNumber((result as any).order_number || null);
          setGeneratedToken(token);
          setEstimatedPickupTime(new Date(Date.now() + 25 * 60000));
          setShowTokenBanner(true);
      }
    } catch (e) {
      addNotification('error', 'Failed to submit');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetPad = () => {
    setActiveOrderId(null);
    setActiveOrderNumber(null);
    setGeneratedToken(null);
    setEstimatedPickupTime(undefined);
    setCurrentOrderItems([]);
    setOrderType(currentUser?.role === 'CASHIER' ? 'TAKEAWAY' : 'DINE_IN');
    setSelectedTableId('');
    setGuestCount(2);
    setCustomerPhone('');
    setCustomerName('');
    setDeliveryAddress('');
    setOrderToEdit(null);
    setShowTokenBanner(false);
    setIsCartOpen(false);
  };

  const { printReceipt } = useThermalPrinter();
  const handlePrintToken = async () => {
    if (!generatedToken) return;
    const readyTime = estimatedPickupTime ? estimatedPickupTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
    const html = `
      <html>
      <head>
          <style>
              body { font-family: 'Courier New', Courier, monospace; width: 280px; padding: 15px; text-align: center; }
              .token { font-size: 56px; font-weight: 900; margin: 10px 0; }
          </style>
      </head>
      <body>
          <div style="font-size: 16px; font-weight: bold;">{currentRestaurant?.name?.toUpperCase() || 'FIREFLOW POS'}</div>
          <div style="border-top: 2px dashed #000; margin: 8px 0;"></div>
          <div style="font-size: 12px; font-weight: bold;">${orderType} ORDER</div>
          <div class="token">${generatedToken}</div>
          <div style="font-size: 12px;">Ready at: ${readyTime}</div>
          ${activeOrderNumber ? `<div style="font-size: 10px; margin-top: 10px;">Order: ${activeOrderNumber}</div>` : ''}
      </body>
      </html>
    `;
    await printReceipt(html);
  };

  const cartItemCount = currentOrderItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-200 overflow-hidden relative">
      <div className="flex-1 relative overflow-hidden flex flex-col pt-4">
        {/* MENU VIEW (PRIMARY CONTENT) */}
        <div className={`shrink-0 bg-slate-950/40 p-3 space-y-3 transition-all duration-300 ${scrollDirection === 'top' ? 'pt-20' : 'pt-4'}`}>
          {isSearchVisible && (
            <div className="relative animate-in slide-in-from-top-2">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input
                type="text" placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900/40 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white outline-none"
              />
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            <button onClick={() => setActiveCategory('all')} className={`shrink-0 px-5 py-2 rounded-xl text-[10px] font-black uppercase ${activeCategory === 'all' ? 'bg-white text-black' : 'bg-slate-900/50 text-slate-500'}`}>All</button>
            {allCategories.map(cat => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`shrink-0 px-5 py-2 rounded-xl text-[10px] font-black uppercase ${activeCategory === cat.id ? 'bg-orange-600 text-white' : 'bg-slate-900/50 text-slate-500'}`}>{cat.name}</button>
            ))}
          </div>
        </div>

        <div id="mobile-pos-scroll-container" className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
          <div className="grid grid-cols-2 gap-3 pb-32">
            {filteredItems.map(item => {
              const cartItem = currentOrderItems.find(ci => ci.menu_item_id === item.id && ci.item_status === 'DRAFT');
              return (
                <div key={item.id} className="bg-slate-900/40 border border-white/5 rounded-3xl overflow-hidden relative">
                  <div className="aspect-[4/3] bg-slate-800">
                    {item.image_url && <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />}
                    <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded-full text-[9px] font-black">Rs. {item.price}</div>
                  </div>
                  <div className="p-3">
                    <div className="text-[10px] font-black uppercase truncate mb-2">{item.name}</div>
                    {cartItem ? (
                      <div className="flex items-center bg-slate-950 rounded-xl h-8 border border-orange-500/30">
                        <button onClick={() => updateQuantity(item.id!, -1)} className="flex-1 flex justify-center text-slate-500 active:scale-95"><Minus size={12}/></button>
                        <span className="flex-1 text-center text-xs font-black text-orange-500">{cartItem.quantity}</span>
                        <button onClick={() => updateQuantity(item.id!, 1)} className="flex-1 flex justify-center text-orange-500 active:scale-95"><Plus size={12}/></button>
                      </div>
                    ) : (
                      <button onClick={() => addToOrder(item)} className="w-full h-8 bg-orange-600 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform shadow-lg shadow-orange-600/20">Add</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* HEADER BAR (ONLINE STORE MODEL) */}
      <header className={`fixed top-0 left-0 right-0 z-[60] bg-slate-950/80 backdrop-blur-xl border-b border-white/5 p-3 flex justify-between items-center transition-transform duration-300 ease-in-out ${scrollDirection === 'down' ? '-translate-y-full' : 'translate-y-0'}`}>
        <div className="flex flex-col">
          <span className="text-[8px] font-black text-orange-500 uppercase">{currentRestaurant?.name || 'FIREFLOW'}</span>
          <div onClick={() => setShowOrderOptions(true)} className="flex items-center gap-1 active:scale-95 transition-transform bg-white/5 pr-2 rounded-full mt-0.5 border border-white/5 filter drop-shadow-md">
            <div className="w-5 h-5 bg-orange-600 rounded-full flex items-center justify-center mr-1">
                {orderType === 'DINE_IN' ? <Utensils size={10} className="text-white"/> : <ShoppingBag size={10} className="text-white"/>}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest">{orderType === 'DINE_IN' ? (tables.find(t=>t.id===selectedTableId)?.name || 'Table Context') : 'Takeaway Context'}</span>
            <ChevronDown size={12} className="text-slate-400" />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Search Action */}
          <button onClick={() => setIsSearchVisible(!isSearchVisible)} className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${isSearchVisible ? 'bg-orange-500 text-white shadow-lg' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
            <Search size={18}/>
          </button>
          
          {/* Floor Action */}
          <button 
            onClick={() => setActiveView('ORDER_HUB')} 
            className="w-10 h-10 flex items-center justify-center bg-slate-800 text-slate-300 rounded-full active:scale-95 transition-all hover:bg-slate-700"
            title="Return to Floor"
          >
            <MapIcon size={18}/>
          </button>
          
          <div className="w-px h-6 bg-slate-800 mx-1"></div>
          
          {/* Cart Action */}
          <button 
            onClick={() => setIsCartOpen(true)} 
            className="h-10 px-4 flex items-center justify-center bg-orange-600 text-white rounded-full active:scale-95 transition-all shadow-lg shadow-orange-600/20 relative gap-2"
          >
            <ShoppingCart size={18}/>
            {cartItemCount > 0 && (
              <div className="bg-white text-orange-600 text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center justify-center">
                {cartItemCount}
              </div>
            )}
          </button>
        </div>
      </header>

      {/* FULL SCREEN CART OVERLAY */}
      <div className={`fixed inset-0 z-[70] bg-[#050810] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isCartOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        {/* Cart Header */}
        <header className="bg-slate-950/80 backdrop-blur-xl border-b border-white/5 p-4 flex justify-between items-center">
            <button onClick={() => setIsCartOpen(false)} className="px-4 py-2 bg-slate-800 text-white rounded-full active:scale-95 transition-transform flex items-center gap-2">
                <ArrowLeft size={16} /> 
                <span className="text-[10px] font-black uppercase tracking-widest leading-none pt-0.5">Back to Menu</span>
            </button>
            <div className="flex gap-2">
               <button onClick={()=>setIsRecallOpen(true)} className="p-2.5 bg-white/5 text-slate-300 rounded-full active:scale-95 transition-all"><History size={16}/></button>
               <button onClick={() => { setIsCartOpen(false); resetPad(); }} className="p-2.5 bg-red-500/10 text-red-500 rounded-full active:scale-95 transition-all"><X size={16}/></button>
            </div>
        </header>

        {/* Cart Body */}
        <div className="flex-1 flex flex-col px-4 overflow-hidden pt-4 pb-safe">
           <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar no-scrollbar pb-6">
             {currentOrderItems.length > 0 ? currentOrderItems.map((item, idx) => {
               const status = item.item_status || 'DRAFT';
               const isDraft = status === 'DRAFT';
               const isPending = status === 'PENDING';

               return (
                 <div key={`${item.id}-${idx}`} className="bg-slate-900/60 p-4 rounded-3xl border border-white/5 flex flex-col gap-3 shadow-sm relative overflow-hidden">
                   {isDraft && <div className="absolute top-0 right-0 w-2 h-full bg-orange-500/50" />}
                   <div className="flex justify-between items-center">
                     <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${isDraft ? 'bg-orange-500/10 text-orange-500' : 'bg-green-500/10 text-green-500'}`}>
                          {item.quantity}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-black uppercase text-white tracking-wide">{item.item_name}</span>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{status}</span>
                        </div>
                     </div>
                     <span className="text-xs font-black text-white px-2">Rs. {(item.unit_price * item.quantity).toLocaleString()}</span>
                   </div>

                   {isDraft ? (
                     <div className="flex justify-end gap-2 items-center border-t border-white/5 pt-3 mt-1">
                       <button onClick={() => updateQuantity(item.menu_item_id!, -1)} className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-slate-400 active:scale-95"><Minus size={12}/></button>
                       <span className="text-xs font-black w-6 text-center">{item.quantity}</span>
                       <button onClick={() => updateQuantity(item.menu_item_id!, 1)} className="w-8 h-8 bg-orange-600/20 rounded-lg flex items-center justify-center text-orange-500 border border-orange-500/20 active:scale-95"><Plus size={12}/></button>
                     </div>
                   ) : isPending && (
                     <div className="flex justify-end border-t border-white/5 pt-3">
                        <button 
                          onClick={() => handleServeItem(item.id!)}
                          className="px-4 py-2 bg-green-600/20 text-green-500 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 border border-green-500/20 active:scale-95 transition-all"
                        >
                          <CheckCircle2 size={12} />
                          Mark Served
                        </button>
                     </div>
                   )}
                 </div>
               );
             }) : (
               <div className="flex flex-col items-center justify-center py-32 opacity-40">
                  <div className="bg-slate-900 border border-white/5 p-6 rounded-full mb-6">
                    <ShoppingBag size={48} className="text-slate-500" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-[0.2em] text-white">Cart is empty</span>
                  <span className="text-[10px] font-bold text-slate-500 mt-2 uppercase tracking-widest">Tap 'Back' to browse the menu.</span>
               </div>
             )}
           </div>

           {/* Cart Footer */}
           <div className="shrink-0 pt-4 pb-12 space-y-4 border-t border-white/10 bg-[#050810]">
             <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 tracking-widest">
                  <span>Subtotal</span>
                  <span>Rs. {breakdown.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Grand Total</span>
                  <span className="text-3xl font-black text-white">Rs. {breakdown.total.toLocaleString()}</span>
                </div>
             </div>
             
             {currentOrderItems.some(i => (i.item_status || 'DRAFT') === 'DRAFT') ? (
                <button 
                  onClick={() => handleOrderAction(true)}
                  disabled={isSubmitting || currentOrderItems.length === 0}
                  className="w-full py-5 bg-orange-600 rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] flex items-center justify-center gap-2 shadow-xl shadow-orange-600/20 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <>
                    <Flame size={18} />
                    <span>Send to Kitchen</span>
                  </>}
                </button>
             ) : (
                <div className="flex gap-2">
                   <button className="flex-1 py-4 bg-slate-900 border border-white/5 rounded-[2rem] font-black uppercase text-[10px] tracking-widest active:scale-95 transition-transform text-white">Print Bill</button>
                   <button className="flex-[2] py-4 bg-green-600 rounded-[2rem] font-black uppercase text-[10px] tracking-widest active:scale-95 shadow-lg shadow-green-600/20 transition-transform text-white">Pay Now</button>
                </div>
             )}
           </div>
        </div>
      </div>

      {/* Order Context Overlays */}
       {showOrderOptions && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md p-6 flex flex-col transition-all" onClick={()=>setShowOrderOptions(false)}>
          <div className="flex items-center justify-between mb-8 mt-10">
            <h2 className="text-xl font-black uppercase tracking-widest text-orange-500">Order Context</h2>
            <button onClick={()=>setShowOrderOptions(false)} className="p-3 bg-slate-900 rounded-full text-slate-400 active:scale-95"><X size={20}/></button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-8 pr-2 no-scrollbar" onClick={e=>e.stopPropagation()}>
            <section className="space-y-4">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Order Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as OrderType[]).map(type => (
                  <button 
                    key={type}
                    onClick={() => { setOrderType(type); if(type!=='DINE_IN') setSelectedTableId(''); }}
                    className={`py-8 rounded-[2rem] flex flex-col items-center gap-3 border transition-all ${orderType === type ? 'bg-orange-600 border-orange-500 text-white shadow-xl shadow-orange-600/20 scale-105' : 'bg-slate-900/50 border-white/5 text-slate-500 opacity-60'}`}
                  >
                    {type === 'DINE_IN' ? <Utensils size={24}/> : type === 'DELIVERY' ? <Bike size={24}/> : <ShoppingBag size={24}/>}
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">{type.split('_').join(' ')}</span>
                  </button>
                ))}
              </div>
            </section>

            {orderType === 'DINE_IN' ? (
              <section className="space-y-4 animate-in slide-in-from-bottom-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Select Table</label>
                <div className="grid grid-cols-4 gap-2">
                  {tables.map(t=>(
                    <button 
                      key={t.id} 
                      onClick={()=>{setSelectedTableId(t.id); setShowOrderOptions(false);}} 
                      className={`h-16 rounded-[1.5rem] border font-black text-xs transition-all ${selectedTableId===t.id ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-600/20 text-white scale-105' : 'bg-slate-900 border-white/5 text-slate-400 opacity-80'}`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <section className="space-y-4 animate-in slide-in-from-right-4">
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Customer Info</label>
                 <div className="space-y-3">
                    <input 
                      type="text" 
                      placeholder="Customer Name" 
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      className="w-full bg-slate-900 border border-white/5 rounded-3xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-orange-500 focus:bg-slate-800 uppercase placeholder:text-slate-700 transition-colors"
                    />
                    <input 
                      type="tel" 
                      placeholder="Phone Number" 
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      className="w-full bg-slate-900 border border-white/5 rounded-3xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-orange-500 focus:bg-slate-800 font-mono placeholder:text-slate-700 transition-colors"
                    />
                    {orderType === 'DELIVERY' && (
                      <textarea 
                        placeholder="Delivery Address" 
                        value={deliveryAddress}
                        onChange={e => setDeliveryAddress(e.target.value)}
                        className="w-full bg-slate-900 border border-white/5 rounded-3xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-orange-500 focus:bg-slate-800 h-24 uppercase placeholder:text-slate-700 transition-colors"
                      />
                    )}
                 </div>
                 <button 
                   onClick={() => setShowOrderOptions(false)}
                   className="w-full py-5 bg-orange-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl shadow-orange-600/20 active:scale-95 transition-transform mt-4"
                 >
                   Confirm Details
                 </button>
              </section>
            )}
          </div>
        </div>
      )}

      {isRecallOpen && (
        <RecallModal 
          isOpen={isRecallOpen} 
          onClose={()=>setIsRecallOpen(false)} 
          orders={orders} 
          onSelectOrder={o=>{setOrderToEdit(o); setIsRecallOpen(false);}} 
          currentUser={currentUser} 
        />
      )}

      {showTokenBanner && generatedToken && (
        <TokenDisplayBanner 
          token={generatedToken} 
          orderType={orderType} 
          onPrintToken={handlePrintToken}
          onNewOrder={()=>{setShowTokenBanner(false); resetPad();}} 
        />
      )}
      
      {isSubmitting && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-md flex items-center justify-center">
           <div className="bg-slate-900 p-8 rounded-[2rem] border border-white/5 flex flex-col items-center gap-5 shadow-2xl">
              <Loader2 className="animate-spin text-orange-500" size={48} />
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Processing</div>
           </div>
        </div>
      )}
    </div>
  );
};
