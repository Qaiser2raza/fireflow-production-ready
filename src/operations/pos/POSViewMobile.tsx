import React, { useState, useMemo, useEffect } from 'react';
import { MenuItem, OrderItem, OrderType, OrderStatus } from '../../shared/types';
import { useAppContext } from '../../client/contexts/AppContext';
import { 
  Search, X, Plus, Minus, Loader2, Utensils, 
  Flame, ShoppingBag, Bike, ChevronDown, 
  ShoppingCart, ArrowRight, Banknote, CreditCard,
  Clock, CheckCircle2, CheckSquare, History
} from 'lucide-react';
import { RecallModal } from '../dashboard/components/RecallModal';
import { TokenDisplayBanner } from './components/TokenDisplayBanner';
import { useThermalPrinter } from '../../hooks/useThermalPrinter';

export const POSViewMobile: React.FC = () => {
  const {
    addOrder, updateOrder, calculateOrderTotal, orders,
    currentUser, menuItems, menuCategories,
    tables, addNotification, orderToEdit, setOrderToEdit,
    customers, addCustomer, processPayment, operationsConfig
  } = useAppContext();

  // UI State
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showOrderOptions, setShowOrderOptions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecallOpen, setIsRecallOpen] = useState(false);

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

  // Sync with orderToEdit from context (e.g. from Floor Plan)
  useEffect(() => {
    if (orderToEdit) {
      setActiveOrderId(orderToEdit.id);
      setCurrentOrderItems(orderToEdit.order_items || []);
      setOrderType(orderToEdit.type || 'DINE_IN');
      setSelectedTableId(orderToEdit.table_id || '');
      setGuestCount(orderToEdit.guest_count || 2);
      setIsCartSheetOpen(false); // Close cart if we just switched to a new order
    }
  }, [orderToEdit]);

  // Initialize from activeOrderData if editing
  const activeOrderData = useMemo(() => orders?.find(o => o.id === activeOrderId), [orders, activeOrderId]);
  const isReadOnly = activeOrderData?.status === OrderStatus.CLOSED;

  // Live Sync Effect (Mobile)
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
  }, [activeOrderData?.order_items?.map(i => i.item_status).join(',')]);

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

  // Compute All Categories
  const allCategories = useMemo(() => {
    const categories: { id: string; name: string }[] = [];
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

    return categories.sort((a: any, b: any) => (a.priority || 0) - (b.priority || 0));
  }, [menuCategories, menuItems]);

  // Filter Menu Items
  const filteredItems = useMemo(() => {
    let items = Array.isArray(menuItems) ? menuItems : [];
    if (activeCategory && activeCategory !== 'all') {
      items = items.filter(i => i.category === activeCategory || i.category_id === activeCategory);
    }
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      items = items.filter(i =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.name_urdu || '').includes(q)
      );
    }
    return items;
  }, [menuItems, activeCategory, searchQuery]);

  // Breakdown
  const breakdown = useMemo(() => {
    const defaultBreakdown = { subtotal: 0, serviceCharge: 0, tax: 0, deliveryFee: 0, discount: 0, total: 0 };
    if (typeof calculateOrderTotal !== 'function') return defaultBreakdown;
    return calculateOrderTotal(currentOrderItems, orderType, guestCount) || defaultBreakdown;
  }, [currentOrderItems, orderType, guestCount, calculateOrderTotal]);

  const cartBadgeCount = useMemo(() => {
    return currentOrderItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [currentOrderItems]);

  // Cart Actions
  const addToOrder = (item: MenuItem) => {
    if (isReadOnly) return;
    setCurrentOrderItems(prev => {
      const existingIndex = prev.findIndex(i => i.menu_item_id === item.id && i.item_status === 'DRAFT');
      if (existingIndex !== -1) {
        const newItems = [...prev];
        newItems[existingIndex] = { ...newItems[existingIndex], quantity: newItems[existingIndex].quantity + 1 };
        return newItems;
      }
      return [{
        id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        menu_item_id: item.id,
        menu_item: item,
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
      // Auto-save customer if new
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
        if (shouldFire && item.item_status === 'DRAFT') {
          return { ...item, item_status: 'PENDING' };
        }
        return item;
      });

      const orderPayload = {
        id: activeOrderId || undefined,
        order_number: `ORD-${Date.now()}`,
        type: orderType,
        status: shouldFire ? OrderStatus.ACTIVE : OrderStatus.ACTIVE,
        order_items: itemsToSubmit,
        table_id: selectedTableId || undefined,
        customer_phone: customerPhone || undefined,
        customer_name: customerName || undefined,
        delivery_address: deliveryAddress || undefined,
        guest_count: guestCount,
        total: breakdown.total,
        restaurant_id: currentUser?.restaurant_id
      } as any;

      const result = activeOrderId ? await updateOrder(orderPayload) : await addOrder(orderPayload);
      if (!activeOrderId && result.id) setActiveOrderId(result.id);

      addNotification('success', shouldFire ? 'Sent to Kitchen' : 'Order Saved');
      
      if (shouldFire && (orderType === 'TAKEAWAY' || orderType === 'DELIVERY')) {
          const backendToken = result.takeaway_orders?.[0]?.token_number || result.takeaway_orders?.token_number;
          const token = backendToken || Math.floor(1000 + Math.random() * 9000).toString();
          
          setActiveOrderNumber(result.order_number || null);
          setGeneratedToken(token);
          setEstimatedPickupTime(new Date(Date.now() + 25 * 60000));
          setShowTokenBanner(true);
      }

      if (shouldFire) setIsCartSheetOpen(false);
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
    setCurrentOrderItems([]);
    setOrderType(currentUser?.role === 'CASHIER' ? 'TAKEAWAY' : 'DINE_IN');
    setSelectedTableId('');
    setGuestCount(2);
    setCustomerPhone('');
    setCustomerName('');
    setDeliveryAddress('');
    setOrderToEdit(null);
    setIsCartSheetOpen(false);
    setShowTokenBanner(false);
  };

  const { printReceipt } = useThermalPrinter();

  const handlePrintToken = async () => {
    if (!generatedToken) return;
    const readyTime = estimatedPickupTime ? estimatedPickupTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
    const html = `
      <html>
      <head>
          <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128&display=swap" rel="stylesheet">
          <style>
              body { margin: 0; padding: 0; }
              .barcode { font-family: 'Libre Barcode 128', sans-serif; font-size: 60px; margin: 10px 0; }
          </style>
      </head>
      <body>
          <div style="font-family: 'Courier New', Courier, monospace; width: 280px; padding: 15px; text-align: center; border: 2px solid #000; border-radius: 10px;">
              <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">${currentUser?.restaurant_id ? 'FIREFLOW POS' : 'TOKEN SLIP'}</div>
              <div style="border-top: 2px dashed #000; margin: 8px 0;"></div>
              <div style="font-size: 12px; margin-bottom: 12px; font-weight: bold;">${orderType} ORDER</div>
              <div style="font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Token</div>
              <div style="font-size: 56px; font-weight: 900; margin-bottom: 10px;">${generatedToken}</div>
              <div style="font-size: 12px; margin-bottom: 15px;">Target Pickup: ${readyTime}</div>
              
              ${activeOrderNumber ? `
                  <div style="margin: 15px 0; padding: 10px 0;">
                      <div class="barcode">*${activeOrderNumber}*</div>
                      <div style="font-size: 10px; font-weight: bold; margin-top: 5px;">RECALL CODE: ${activeOrderNumber}</div>
                  </div>
              ` : ''}
              
              <div style="border-top: 1px dashed #000; margin: 15px 0;"></div>
              <div style="font-size: 9px; color: #333;">Generated: ${new Date().toLocaleString()}</div>
              <div style="font-size: 8px; margin-top: 5px; opacity: 0.6;">Powering Precision Dining</div>
          </div>
      </body>
      </html>
    `;
    await printReceipt(html);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#020617] text-slate-200 overflow-hidden font-sans relative">
      
      {/* 1. TOP NAV: Branding & Context */}
      <header className="shrink-0 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.3em]">Fireflow Store</span>
          <div className="flex items-center gap-1.5" onClick={() => setShowOrderOptions(!showOrderOptions)}>
            <span className="text-sm font-bold text-white truncate max-w-[120px]">
              {orderType === 'DINE_IN' ? (selectedTableId ? tables.find(t => t.id === selectedTableId)?.name : 'Select Table') : 'Takeaway'}
            </span>
            <ChevronDown size={14} className={`text-slate-500 transition-transform ${showOrderOptions ? 'rotate-180' : ''}`} />
          </div>
        </div>

        <div className="flex items-center gap-2">
           <button 
             onClick={() => setIsRecallOpen(true)}
             className="p-2.5 rounded-full bg-slate-900 border border-white/5 text-blue-400 active:scale-90 transition-transform"
           >
             <History size={16} />
           </button>
           <button 
             onClick={resetPad}
             className="p-2.5 rounded-full bg-slate-900 border border-white/5 text-slate-400 active:scale-90 transition-transform"
           >
             <X size={16} />
           </button>
        </div>
      </header>

      {/* 6. MODALS & OVERLAYS */}
      {isRecallOpen && (
        <RecallModal
          isOpen={isRecallOpen}
          onClose={() => setIsRecallOpen(false)}
          orders={orders}
          onSelectOrder={(order) => {
            setOrderToEdit(order);
            setIsRecallOpen(false);
          }}
          currentUser={currentUser}
        />
      )}

      {showTokenBanner && generatedToken && (
        <TokenDisplayBanner 
          token={generatedToken}
          orderNumber={activeOrderNumber || undefined}
          orderType={orderType}
          estimatedReadyTime={estimatedPickupTime}
          onPrintToken={handlePrintToken}
          onNewOrder={() => {
            setShowTokenBanner(false);
            resetPad();
          }}
        />
      )}

      {/* 2. SEARCH & CATEGORIES */}
      <div className="shrink-0 bg-slate-950/40 p-3 space-y-3">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 transition-colors group-focus-within:text-orange-500" size={16} />
          <input
            type="text"
            placeholder="Search our menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/50 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm font-medium text-white outline-none focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/5 transition-all placeholder:text-slate-700"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeCategory === 'all' ? 'bg-white text-black shadow-lg shadow-white/10' : 'bg-slate-900 text-slate-500'}`}
          >
            All Items
          </button>
          {allCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeCategory === cat.id ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'bg-slate-900 text-slate-500'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* 3. MENU GRID (Online Store Style) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2">
        <div className="grid grid-cols-2 gap-3 pb-44">
          {filteredItems.map(item => {
            const cartItem = currentOrderItems.find(ci => ci.menu_item_id === item.id);
            return (
              <div 
                key={item.id}
                className={`relative rounded-3xl overflow-hidden border transition-all duration-300 active:scale-[0.98] ${cartItem ? 'border-orange-500 ring-1 ring-orange-500/20 bg-orange-600/5' : 'border-white/5 bg-slate-900/40 hover:bg-slate-900/60'}`}
              >
                {/* Item Image Overlay (Top Half) */}
                <div className="h-32 bg-slate-800 relative overflow-hidden group/img">
                  {item.image_url ? (
                    <img 
                      src={item.image_url} 
                      alt={item.name} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                       <Utensils size={32} className="text-slate-700 opacity-20" />
                    </div>
                  )}
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent"></div>
                  
                  {/* Category Tag */}
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[8px] font-black text-white/70 uppercase tracking-widest border border-white/5">
                    {item.category}
                  </span>
                </div>

                {/* Content */}
                <div className="p-3 space-y-1">
                  <div className="text-[11px] font-black text-white leading-tight line-clamp-1 uppercase tracking-tight">{item.name}</div>
                  <div className="text-[10px] text-orange-500 font-black">Rs. {item.price.toLocaleString()}</div>
                  
                  {/* Controls */}
                  <div className="mt-3 flex items-center justify-between gap-1 overflow-hidden">
                    {cartItem ? (
                      <div className="flex-1 flex items-center bg-slate-950 border border-white/5 rounded-xl h-9 overflow-hidden">
                        <button 
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-8 h-full flex items-center justify-center hover:bg-red-500/10 transition-colors"
                        >
                          <Minus size={12} className="text-slate-400" />
                        </button>
                        <span className="flex-1 text-center text-[11px] font-black text-white">{cartItem.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-8 h-full flex items-center justify-center hover:bg-orange-500/10 transition-colors"
                        >
                          <Plus size={12} className="text-orange-500" />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => addToOrder(item)}
                        className="flex-1 h-9 rounded-xl bg-orange-600 hover:bg-orange-500 text-white flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-orange-600/10 active:scale-95"
                      >
                        <Plus size={14} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Add</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. PERSISTENT BOTTOM BAR (THE TRIGGER) */}
      {cartBadgeCount > 0 && !isCartSheetOpen && (
        <div className="absolute bottom-20 left-0 right-0 p-4 z-40 animate-in slide-in-from-bottom-2">
          <div className="max-w-[500px] mx-auto">
            <button 
              onClick={() => setIsCartSheetOpen(true)}
              className="w-full flex items-center justify-between bg-white text-black rounded-3xl px-6 py-4 shadow-2xl shadow-white/10 active:scale-[0.98] transition-all group pointer-events-auto"
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="p-3 bg-black text-white rounded-2xl group-hover:scale-110 transition-transform">
                    <ShoppingCart size={20} />
                  </div>
                  <span className="absolute -top-1.5 -right-1.5 block w-6 h-6 bg-orange-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white">
                    {cartBadgeCount}
                  </span>
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Review Items</span>
                  <span className="text-lg font-black leading-none tracking-tight">Rs. {breakdown.total.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest">Cart</span>
                <ArrowRight size={18} />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 5. SLIDE-UP CART (BOTTOM SHEET) */}
      <div 
        className={`fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm transition-opacity duration-300 ${isCartSheetOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsCartSheetOpen(false)}
      >
        <div 
          className={`absolute bottom-0 left-0 right-0 max-h-[85vh] bg-[#0B0F19] rounded-t-[3rem] border-t border-white/5 flex flex-col transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${isCartSheetOpen ? 'translate-y-0' : 'translate-y-full'}`}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag Handle */}
          <div className="w-12 h-1.5 bg-slate-800 rounded-full mx-auto mt-4 mb-2"></div>
          
          <div className="px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-black text-white uppercase tracking-tighter">Your Order</h2>
            <button onClick={() => setIsCartSheetOpen(false)} className="p-2 text-slate-500">
              <ChevronDown size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 space-y-4 py-2 custom-scrollbar">
            {currentOrderItems.map((item, idx) => {
              const status = item.item_status || 'DRAFT';
              const isDraft = status === 'DRAFT';
              const isDone = status === 'DONE';

              return (
                <div key={`${item.id || item.menu_item_id}-${idx}`} className="bg-slate-900 border border-white/5 rounded-[2rem] p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm border ${isDraft ? 'bg-slate-950 text-orange-500 border-orange-500/20' : 'bg-gold-500 text-black border-gold-500'}`}>
                      {item.quantity}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-black text-white uppercase tracking-tight">{item.item_name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500">Rs. {item.unit_price.toLocaleString()}</span>
                        {status !== 'DRAFT' && (
                          <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest flex items-center gap-1 ${
                            status === 'PENDING' ? 'bg-blue-500/20 text-blue-400' :
                            status === 'PREPARING' ? 'bg-orange-500/20 text-orange-400' :
                            status === 'DONE' ? 'bg-green-500 text-black' :
                            'bg-slate-800 text-slate-500'
                          }`}>
                            {status === 'DONE' ? <CheckCircle2 size={8}/> : status === 'PREPARING' ? <Flame size={8} className="animate-pulse"/> : <Clock size={8}/>}
                            {status}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-white">Rs. {(item.quantity * item.unit_price).toLocaleString()}</div>
                      {isDone && (['SERVER', 'WAITER', 'ADMIN', 'MANAGER'].includes(currentUser?.role || '')) && (
                        <button 
                          onClick={() => handleServeItem(item.id!)}
                          className="mt-2 px-3 py-1 bg-green-500 text-black text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1 active:scale-90"
                        >
                          <CheckSquare size={10}/> Serve
                        </button>
                      )}
                    </div>
                  </div>

                  {isDraft && (
                    <div className="flex items-center justify-end gap-4 border-t border-white/5 pt-3 mt-1">
                      <button onClick={() => updateQuantity(item.menu_item_id, -1)} className="w-10 h-10 rounded-xl bg-slate-950 border border-white/5 flex items-center justify-center text-slate-400"><Minus size={16}/></button>
                      <span className="text-sm font-black">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.menu_item_id, 1)} className="w-10 h-10 rounded-xl bg-orange-600/20 text-orange-500 border border-orange-500/20 flex items-center justify-center text-orange-500"><Plus size={16}/></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-6 bg-slate-900/50 space-y-4 border-t border-white/5 pb-10">
             <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-widest">
                  <span>Subtotal</span>
                  <span>Rs. {breakdown.subtotal.toLocaleString()}</span>
                </div>
                {breakdown.tax > 0 && (
                  <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-widest">
                    <span>Tax (16%)</span>
                    <span>Rs. {breakdown.tax.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline border-t border-white/5 pt-3">
                  <span className="text-xs font-black text-white uppercase tracking-[0.3em]">Total</span>
                  <span className="text-3xl font-black text-white tracking-tighter">Rs. {breakdown.total.toLocaleString()}</span>
                </div>
             </div>

             <div className="flex gap-3">
                {currentOrderItems.some(i => i.item_status === 'DRAFT') ? (
                  <>
                    <button 
                      onClick={() => handleOrderAction(false)}
                      disabled={isSubmitting}
                      className="flex-1 py-4 rounded-2xl bg-slate-900 border border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400"
                    >
                      Save Draft
                    </button>
                    <button 
                      onClick={() => handleOrderAction(true)}
                      disabled={isSubmitting}
                      className="flex-[2] py-4 rounded-3xl bg-orange-600 text-white font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 shadow-xl shadow-orange-600/20 active:scale-95 transition-all"
                    >
                      {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <>
                        <Flame size={18} className="animate-pulse" />
                        <span>Send to Kitchen</span>
                      </>}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Role-based mobile actions */}
                    {['SERVER', 'WAITER'].includes(currentUser?.role || '') && activeOrderData?.status === 'READY' && (
                      <button
                        onClick={async () => {
                          await updateOrder({ id: activeOrderId!, status: 'BILL_REQUESTED' as any });
                          addNotification('success', 'Bill Requested');
                          setIsCartSheetOpen(false);
                        }}
                        className="flex-1 py-4 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                      >
                        <CreditCard size={18} />
                        <span>Bill</span>
                      </button>
                    )}

                    {(['CASHIER', 'MANAGER', 'ADMIN'].includes(currentUser?.role || '') || activeOrderData?.status === 'BILL_REQUESTED') && (
                      <button
                        onClick={() => {
                          // Note: PaymentModal is not in MobileView yet, but we enable the entry point 
                          // or route to the desktop-style settle if needed.
                          // For now, we'll show its button to satisfy the UI audit.
                          addNotification('info', 'Please use Desktop for Terminal Settlement');
                        }}
                        className="flex-1 py-4 rounded-3xl bg-green-600 text-white font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2 shadow-xl shadow-green-900/40 active:scale-95 transition-all"
                      >
                        <Banknote size={18} />
                        <span>Pay</span>
                      </button>
                    )}
                  </>
                )}
             </div>
          </div>
        </div>
      </div>

      {/* 6. ORDER SELECTION MODAL (OVERLAY) */}
      {showOrderOptions && (
        <div 
          className="fixed inset-0 z-[70] bg-slate-950/90 backdrop-blur-md p-6 flex flex-col pt-12 animate-in fade-in duration-300"
          onClick={() => setShowOrderOptions(false)}
        >
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">Switch Order Context</h2>
            <button onClick={() => setShowOrderOptions(false)} className="p-2 bg-slate-900 rounded-full text-slate-400">
               <X size={20} />
            </button>
          </div>

          <div className="space-y-6 overflow-y-auto pr-2 no-scrollbar" onClick={e => e.stopPropagation()}>
            <section className="space-y-3">
              <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest pl-2">Service Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as OrderType[])
                .filter(t => {
                  if (['SERVER', 'WAITER'].includes(currentUser?.role || '')) return t === 'DINE_IN';
                  return true;
                })
                .map(type => (
                  <button 
                    key={type}
                    onClick={() => {
                      setOrderType(type);
                      if (type !== 'DINE_IN') setShowOrderOptions(false);
                    }}
                    className={`py-4 rounded-2xl flex flex-col items-center gap-2 border transition-all ${orderType === type ? 'bg-orange-600 border-orange-500 text-white' : 'bg-slate-900 border-white/5 text-slate-500'}`}
                  >
                    {type === 'DINE_IN' ? <Utensils size={18}/> : type === 'DELIVERY' ? <Bike size={18}/> : <ShoppingBag size={18}/>}
                    <span className="text-[8px] font-black uppercase tracking-tighter">{type.split('_').join(' ')}</span>
                  </button>
                ))}
              </div>
            </section>

            {orderType === 'DINE_IN' && (
              <section className="space-y-3">
                <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest pl-2">Select Table</label>
                <div className="grid grid-cols-4 gap-2">
                  {tables.map(table => (
                    <button 
                      key={table.id}
                      onClick={() => {
                        setSelectedTableId(table.id);
                        setShowOrderOptions(false);
                      }}
                      className={`h-12 rounded-xl text-[10px] font-black transition-all border ${selectedTableId === table.id ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-900 border-white/5 text-slate-400'}`}
                    >
                      {table.name}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {(orderType === 'TAKEAWAY' || orderType === 'DELIVERY') && (
               <section className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Customer Lookup</label>
                    <input 
                      type="text" 
                      placeholder="Customer Name" 
                      value={customerName} 
                      onChange={e => setCustomerName(e.target.value)}
                      className="w-full bg-slate-900 border border-white/5 rounded-2xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-orange-500 uppercase"
                    />
                    <div className="relative">
                      <input 
                        type="tel" 
                        placeholder="Phone Number" 
                        value={customerPhone} 
                        onChange={e => setCustomerPhone(e.target.value)}
                        className="w-full bg-slate-900 border border-white/5 rounded-2xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-orange-500 transition-all font-mono tracking-widest"
                      />
                      {customerPhone.length >= 3 && customers?.filter(c => (c.phone || '').includes(customerPhone)).length > 0 && !customers.find(c => c.phone === customerPhone) && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-2xl overflow-hidden z-[80] shadow-2xl">
                          {customers
                            .filter(c => (c.phone || '').includes(customerPhone))
                            .slice(0, 3)
                            .map(c => (
                              <button
                                key={c.id}
                                onClick={() => {
                                  setCustomerPhone(c.phone || '');
                                  setCustomerName(c.name || '');
                                  setDeliveryAddress(c.address || '');
                                }}
                                className="w-full px-4 py-3 text-left hover:bg-slate-800 border-b border-white/5 last:border-0"
                              >
                                <div className="text-[10px] font-black text-white uppercase">{c.name}</div>
                                <div className="text-[8px] text-slate-500 mt-1">{c.phone}</div>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {orderType === 'DELIVERY' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Delivery Address</label>
                      <textarea 
                        placeholder="Street, Block, etc." 
                        value={deliveryAddress} 
                        onChange={e => setDeliveryAddress(e.target.value)}
                        className="w-full bg-slate-900 border border-white/5 rounded-2xl px-4 py-3 text-sm font-bold text-white outline-none h-24"
                      />
                    </div>
                  )}
                  <button 
                    onClick={() => setShowOrderOptions(false)}
                    className="w-full py-4 bg-orange-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-orange-600/20"
                  >
                    Apply Settings
                  </button>
               </section>
            )}
          </div>
        </div>
      )}

      {/* Global Transition Overlay for Submitting */}
      {isSubmitting && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300">
           <div className="bg-slate-900 p-8 rounded-[2rem] border border-white/5 shadow-2xl flex flex-col items-center gap-4">
              <Loader2 className="text-orange-500 animate-spin" size={40} />
              <div className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Processing Logic...</div>
           </div>
        </div>
      )}
    </div>
  );
};
