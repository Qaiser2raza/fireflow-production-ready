import React, { useState, useMemo, useEffect } from 'react';
import { MenuItem, OrderItem, OrderType } from '../../shared/types';
import { useAppContext } from '../../client/contexts/AppContext';
import { Search, X, Edit2, Plus, Minus, Loader2, Utensils, Flame, ShoppingBag, Bike, Users, Banknote, Printer } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { CustomerQuickAdd } from './components/CustomerQuickAdd';
import { TokenDisplayBanner } from './components/TokenDisplayBanner';
import { MenuItemCard } from './components/MenuItemCard';
import { PaymentModal } from './components/PaymentModal';
import { ReceiptPreviewModal } from '../../shared/components/ReceiptPreviewModal';
import { Order } from '../../shared/types';

export const POSView: React.FC = () => {
  const {
    addOrder, updateOrder, calculateOrderTotal, orders,
    orderToEdit, setOrderToEdit, setActiveView, currentUser, menuItems, menuCategories,
    tables, addNotification, customers, processPayment
  } = useAppContext();

  // UI & Order State
  // Default to 'trending' (Most Selling)
  const [activeCategory, setActiveCategory] = useState<string>('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTokenBanner, setShowTokenBanner] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [estimatedPickupTime, setEstimatedPickupTime] = useState<Date | undefined>(undefined);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);

  // Order Details State
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [currentOrderItems, setCurrentOrderItems] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>(currentUser?.role === 'CASHIER' ? 'TAKEAWAY' : 'DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [guestCount, setGuestCount] = useState<number>(2);
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [isCustomerLoading, setIsCustomerLoading] = useState(false);

  const debouncedPhone = useDebounce(customerPhone, 400);

  // Load Order for Editing
  useEffect(() => {
    if (orderToEdit) {
      console.log('[POS] Loading order to edit:', orderToEdit.id, 'Items:', orderToEdit.order_items?.length);
      // Load order items
      const mappedItems: OrderItem[] = (orderToEdit.order_items || []).map(item => ({
        id: item.id,
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        item_name: item.item_name,
        category: item.category,
        station: item.station,
        item_status: item.item_status,
        modifications: item.modifications
      }));

      setCurrentOrderItems(mappedItems);
      setActiveOrderId(orderToEdit.id);
      setOrderType(orderToEdit.type as OrderType);

      // Load type-specific data
      console.log('[POS] Order Type:', orderToEdit.type);
      if (orderToEdit.type === 'DINE_IN') {
        console.log('[POS] Dine In Data:', orderToEdit.dine_in_orders);

        // Try to get data from relation first, then fallback to root fields
        const dineIn = orderToEdit.dine_in_orders?.[0];
        const tableId = dineIn?.table_id || orderToEdit.table_id;
        const guests = dineIn?.guest_count || orderToEdit.guest_count;

        if (tableId) {
          console.log('[POS] Setting Table ID:', tableId);
          setSelectedTableId(tableId);
          setGuestCount(guests || 2);
        }
      } else if (orderToEdit.type === 'TAKEAWAY') {
        const takeawayData = orderToEdit.takeaway_orders?.[0];
        setCustomerName(takeawayData?.customer_name || takeawayData?.customerName || orderToEdit.customer_name || orderToEdit.customerName || '');
        setCustomerPhone(takeawayData?.customer_phone || takeawayData?.customerPhone || orderToEdit.customer_phone || orderToEdit.customerPhone || '');
      } else if (orderToEdit.type === 'DELIVERY') {
        const deliveryData = orderToEdit.delivery_orders?.[0];
        setCustomerName(deliveryData?.customer_name || deliveryData?.customerName || orderToEdit.customer_name || orderToEdit.customerName || '');
        setCustomerPhone(deliveryData?.customer_phone || deliveryData?.customerPhone || orderToEdit.customer_phone || orderToEdit.customerPhone || '');
        setDeliveryAddress(deliveryData?.delivery_address || deliveryData?.deliveryAddress || orderToEdit.delivery_address || orderToEdit.deliveryAddress || '');
      }

      addNotification('info', `Editing Order #${orderToEdit.id.slice(-6)}`);
    }
  }, [orderToEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Customer Lookup logic
  useEffect(() => {
    const cleanPhone = debouncedPhone.replace(/\D/g, '');
    if (cleanPhone.length >= 10 && (orderType === 'TAKEAWAY' || orderType === 'DELIVERY')) {
      setIsCustomerLoading(true);
      const match = customers?.find(c => (c.phone || '').replace(/\D/g, '') === cleanPhone);
      if (match) {
        setCustomerName(match.name || '');
        setDeliveryAddress(match.address || '');
        addNotification('success', `✓ Customer Found: ${match.name}`);
      }
      setIsCustomerLoading(false);
    } else if (cleanPhone.length === 0) {
      setCustomerName('');
      setDeliveryAddress('');
    }
  }, [debouncedPhone, orderType]); // Removed customers/addNotification from deps to prevent re-runs resetting manual name input



  const activeOrderData = activeOrderId ? orders.find(o => o.id === activeOrderId) : null;
  const isAlreadyPaid = activeOrderData?.status === 'CLOSED' || activeOrderData?.payment_status === 'PAID';

  const breakdown = useMemo(() => {
    const defaultBreakdown = { subtotal: 0, serviceCharge: 0, tax: 0, deliveryFee: 0, discount: 0, total: 0 };
    if (typeof calculateOrderTotal !== 'function') return defaultBreakdown;
    return calculateOrderTotal(currentOrderItems, orderType, guestCount, 250) || defaultBreakdown;
  }, [currentOrderItems, orderType, guestCount, calculateOrderTotal]);

  const allCategories = useMemo(() => {
    const categories: { id: string; name: string }[] = [];
    const seenNames = new Set<string>();

    // 1. Add explicitly defined menu categories first
    menuCategories?.forEach(c => {
      const nameLower = c.name.toLowerCase().trim();
      if (!seenNames.has(nameLower)) {
        categories.push({ id: c.id, name: c.name });
        seenNames.add(nameLower);
      }
    });

    const derivedStatus = orderToEdit?.status || activeOrderData?.status;

    // Check if there are any items that haven't been processed yet
    const hasUnfiredItems = currentOrderItems.some(i => i.item_status === 'PENDING');

    // DEBUG: Trace Status for Button
    console.log('[POS Debug] Order Status Check:', {
      activeOrderId,
      activeOrderDataStatus: activeOrderData?.status,
      orderToEditStatus: orderToEdit?.status,
      derivedStatus,
      hasUnfiredItems
    });

    // 2. Add categories found in items that aren't already in the list
    menuItems?.forEach(i => {
      if (i.category) {
        const nameLower = i.category.toLowerCase().trim();
        if (!seenNames.has(nameLower)) {
          categories.push({ id: i.category, name: i.category });
          seenNames.add(nameLower);
        }
      }
    });

    return categories;
  }, [menuCategories, menuItems]);

  const filteredItems = useMemo(() => {
    let items = Array.isArray(menuItems) ? menuItems : [];

    // 1. Category / State Filter
    if (activeCategory === 'trending') {
      items = items.filter(i => (i.is_available ?? i.available ?? true) !== false).slice(0, 24);
    } else if (activeCategory && activeCategory !== 'all') {
      items = items.filter(i =>
        i.category === activeCategory ||
        i.category_id === activeCategory
      );
    }

    // 2. Search Filter (Robust)
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      items = items.filter(i =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.name_urdu || '').includes(q)
      );
    }

    return items;
  }, [activeCategory, searchQuery, menuItems]);

  // Auto-select 'trending' if none selected
  useEffect(() => {
    if (!activeCategory) {
      setActiveCategory('trending');
    }
  }, [activeCategory]);

  const resetPad = () => {
    console.log('[POS] Resetting Pad');
    setActiveOrderId(null);
    setCurrentOrderItems([]);
    setCustomerPhone('');
    setCustomerName('');
    setDeliveryAddress('');
    setOrderType(currentUser?.role === 'CASHIER' ? 'TAKEAWAY' : 'DINE_IN');
    setSelectedTableId('');
    setGuestCount(2);
    setIsSubmitting(false);

    // Clear global edit state
    if (setOrderToEdit) setOrderToEdit(null);
  };

  const handleClose = () => {
    // Navigate back to Order Hub when closing manualy
    resetPad();
    if (setActiveView) setActiveView('ORDER_HUB');
  };


  const isReadOnly = useMemo(() => {
    if (!activeOrderData) return false;

    // Check Status
    const isStatusLocked = [
      'CLOSED',
      'CANCELLED',
      'VOIDED'
    ].includes(activeOrderData.status);

    // Check Driver Assignment (In Transit)
    const isDriverAssigned = !!(activeOrderData.assigned_driver_id || activeOrderData.delivery_orders?.[0]?.driver_id);

    return isStatusLocked || isDriverAssigned;
  }, [activeOrderData]);

  const addToOrder = (item: MenuItem) => {
    if (!item.available || isAlreadyPaid || isReadOnly) return;
    setCurrentOrderItems(prev => {
      // ... existing add logic ...
      const existingIndex = prev.findIndex(i => i.menu_item_id === item.id && i.item_status === 'DRAFT');
      if (existingIndex >= 0) {
        const newItems = [...prev];
        newItems[existingIndex] = { ...newItems[existingIndex], quantity: newItems[existingIndex].quantity + 1 };
        return newItems;
      }
      return [{
        id: crypto.randomUUID(),
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
    if (isAlreadyPaid || isReadOnly) return;
    setCurrentOrderItems(prev => {
      // ... existing update logic ...
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

    // Validations
    if (orderType === 'DINE_IN' && !selectedTableId) {
      addNotification('info', 'Please select a table to fire order.');
      setShowDetailsModal(true);
      return;
    }
    if ((orderType === 'DELIVERY' || orderType === 'TAKEAWAY') && !customerPhone) {
      addNotification('info', 'Customer Phone helps track orders.');
      setShowDetailsModal(true);
      return;
    }

    try {
      // v3.0 Mapping: All flow is through ACTIVE status
      const nextStatus = 'ACTIVE';
      const updatedItems = currentOrderItems.map(item => {
        if (shouldFire && item.item_status === 'DRAFT') {
          // Explicitly Fire: Transition DRAFT items to PENDING or DONE
          const shouldSkipPrep = item.menu_item?.requires_prep === false || item.station === 'NO_PRINT';
          return { ...item, item_status: shouldSkipPrep ? 'DONE' : 'PENDING' };
        }
        return item;
      });

      const orderData = {
        id: activeOrderId || undefined,
        type: orderType,
        status: nextStatus,
        items: updatedItems,
        table_id: selectedTableId,
        guest_count: guestCount,
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_address: deliveryAddress,
        total: breakdown.total
      };

      const result = activeOrderId
        ? await updateOrder(orderData as any)
        : await addOrder(orderData as any);

      if (result) {
        // Capture the server-side order ID if this was a new order
        if (!activeOrderId && result.id) {
          setActiveOrderId(result.id);
        }

        addNotification('success', shouldFire ? 'Order Saved & Fired' : 'Order Saved');

        if (orderType === 'TAKEAWAY' || orderType === 'DELIVERY') {
          // Use backend token if available (v3.0 priority)
          const backendToken = result.takeaway_orders?.[0]?.token_number || result.takeaway_orders?.token_number;
          const token = backendToken || Math.floor(1000 + Math.random() * 9000).toString();

          setGeneratedToken(token);
          setEstimatedPickupTime(new Date(Date.now() + 25 * 60000));
          setShowTokenBanner(true);
        } else if (orderType === 'DINE_IN') {
          // For Dine-In, stay on screen if we have an ID (edit mode), otherwise generic flow
          if (activeOrderId || result.id) {
            // Stay in context
          } else {
            resetPad();
            if (setActiveView) setActiveView('ORDER_HUB');
          }
        } else {
          // For Save Draft or others, go back
          resetPad();
          if (setActiveView) setActiveView('ORDER_HUB');
        }
      }
    } catch (e) {
      console.error(e);
      addNotification('error', 'Failed to submit order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full bg-[#020617] text-slate-200 overflow-hidden font-sans">
      {/* LEFT: MENU & CATEGORIES */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-white/5">
        {/* Categories Toolbar */}
        <div className="p-4 border-b border-white/5 flex gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveCategory('trending')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeCategory === 'trending' ? 'bg-gold-500 text-black' : 'bg-slate-900 text-slate-500 hover:text-white'}`}
          >
            <Flame size={14} className="inline mr-2" /> Hot
          </button>

          <div className="relative flex-1 min-w-[200px] max-w-sm ml-2 mr-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <input
              type="text"
              placeholder="Search Items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-white outline-none focus:border-gold-500 transition-all placeholder:text-slate-600"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <button
            onClick={() => setActiveCategory('all')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeCategory === 'all' ? 'bg-white text-black' : 'bg-slate-900 text-slate-500 hover:text-white'}`}
          >
            All Items
          </button>
          {allCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-500 hover:text-white'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Menu Grid */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredItems.map(item => (
              <MenuItemCard
                key={item.id}
                item={item}
                onSelect={() => addToOrder(item)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT: CART & CHECKOUT */}
      <div className="w-[420px] bg-[#0B0F19] flex flex-col h-full shrink-0 z-20 shadow-2xl relative">

        {/* Cart Header */}
        <div className="p-6 border-b border-white/5 bg-slate-950/50 backdrop-blur-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-serif font-bold text-white">Current Order</h2>
            {activeOrderId ? (
              <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-lg">EDITING</span>
            ) : (
              <span className="px-2 py-1 bg-green-500/20 text-green-400 text-[10px] font-black uppercase tracking-widest rounded-lg">NEW</span>
            )}
            <button
              onClick={handleClose}
              className="ml-2 p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowDetailsModal(true)}
              className="flex-1 bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between group hover:border-gold-500/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-gold-500">
                  {orderType === 'DINE_IN' ? <Utensils size={16} /> : orderType === 'DELIVERY' ? <Bike size={16} /> : <ShoppingBag size={16} />}
                </div>
                <div className="text-left">
                  <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Type</div>
                  <div className="text-xs font-bold text-white uppercase">{orderType.replace('_', ' ')}</div>
                </div>
              </div>
              <Edit2 size={14} className="text-slate-600 group-hover:text-gold-500" />
            </button>

            {orderType === 'DINE_IN' && (
              <button className="flex-1 bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <Users size={16} className="text-slate-500" />
                  <div className="text-left">
                    <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Table</div>
                    <div className="text-xs font-bold text-white">{tables.find(t => t.id === selectedTableId)?.name || 'Select'}</div>
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
          {currentOrderItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
              <ShoppingBag size={48} className="mb-4" />
              <span className="text-xs font-black uppercase tracking-[0.2em]">Cart Empty</span>
            </div>
          ) : (
            currentOrderItems.map((item, idx) => (
              <div key={`${item.menu_item_id}-${idx}`} className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-3 flex justify-between items-center group hover:bg-slate-900 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center text-white font-bold text-xs border border-slate-800">
                    {item.quantity}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{item.item_name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">Rs. {item.unit_price}</div>
                  </div>
                </div>

                {!isReadOnly && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => updateQuantity(item.menu_item_id, -1)} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center transition-colors"><Minus size={14} /></button>
                    <button onClick={() => updateQuantity(item.menu_item_id, 1)} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-green-500/20 hover:text-green-500 flex items-center justify-center transition-colors"><Plus size={14} /></button>
                  </div>
                )}
                <div className="font-bold text-white text-sm font-mono tracking-tight">
                  Rs. {(item.quantity * item.unit_price).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer / Breakdown */}
        <div className="p-6 bg-[#0B0F19] border-t border-white/5 space-y-4">
          {/* Breakdown Details */}
          <div className="space-y-1.5 text-[9px] font-black tracking-widest uppercase">
            <div className="flex justify-between text-slate-500">
              <span className="opacity-60">Subtotal</span>
              <span className="text-white font-mono tracking-normal">Rs. {breakdown.subtotal.toLocaleString()}</span>
            </div>
            {breakdown.tax > 0 && (
              <div className="flex justify-between text-slate-500">
                <span className="opacity-60 text-gold-500/80">Tax (16%)</span>
                <span className="text-white font-mono tracking-normal">Rs. {breakdown.tax.toLocaleString()}</span>
              </div>
            )}
            {breakdown.deliveryFee > 0 && (
              <div className="flex justify-between text-slate-500">
                <span className="opacity-60 text-blue-400">Delivery Fee</span>
                <span className="text-white font-mono tracking-normal">Rs. {breakdown.deliveryFee.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Total */}
          <div className="flex justify-between items-baseline border-t border-white/5 pt-4">
            <span className="text-[9px] text-slate-500 font-black tracking-[0.3em] uppercase opacity-60">Total</span>
            <div className="flex flex-col items-end leading-none">
              <span className="text-2xl font-black text-white italic tracking-tighter">
                Rs. {breakdown.total.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Actions */}
          {isReadOnly ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-green-500 font-black uppercase tracking-widest text-xs mb-1">
                {activeOrderData?.status.replace(/_/g, ' ')}
              </div>
              <div className="text-slate-500 text-[10px]">
                This order is locked for editing.
              </div>
              <button onClick={resetPad} className="mt-2 text-xs text-white underline">Start New Order</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowReceiptPreview(true)}
                disabled={currentOrderItems.length === 0}
                className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-20 flex-shrink-0"
                title="Print Preview"
              >
                <Printer size={18} />
              </button>

              <button
                disabled={currentOrderItems.length === 0 || isSubmitting}
                onClick={() => handleOrderAction(false)}
                className="flex-1 bg-slate-900 border border-slate-800/50 h-10 rounded-xl text-slate-500 font-black text-[9px] tracking-[0.2em] hover:bg-slate-800 hover:text-white transition-all active:scale-95 disabled:opacity-20 uppercase"
              >
                {isSubmitting ? <Loader2 className="animate-spin mx-auto opacity-50" size={14} /> : 'Save / Update'}
              </button>

              <button
                disabled={currentOrderItems.length === 0 || isSubmitting}
                onClick={() => {
                  const hasUnfiredItems = currentOrderItems.some(i => i.item_status === 'DRAFT');

                  if (hasUnfiredItems) {
                    handleOrderAction(true);
                  } else {
                    setShowPaymentModal(true);
                  }
                }}
                className={`flex-[2] h-10 rounded-xl text-white font-black text-[9px] tracking-[0.2em] shadow-xl transition-all active:scale-95 disabled:opacity-20 flex items-center justify-center gap-2 uppercase italic ${currentOrderItems.some(i => i.item_status === 'DRAFT') ? 'bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 shadow-orange-900/40' : 'bg-green-600 hover:bg-green-500 shadow-green-900/40'}`}
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : (
                  <>
                    {currentOrderItems.some(i => i.item_status === 'DRAFT') ? (
                      <>
                        <Flame size={14} className="animate-pulse" />
                        <span>Fire Order</span>
                      </>
                    ) : (
                      <>
                        <Banknote size={14} />
                        <span>Process Payment</span>
                      </>
                    )}
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {showTokenBanner && generatedToken && (
          <TokenDisplayBanner
            token={generatedToken}
            estimatedReadyTime={estimatedPickupTime}
            onPrintToken={() => addNotification('info', 'Printer not connected')}
            onNewOrder={() => {
              setShowTokenBanner(false);
              resetPad();
            }}
          />
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (activeOrderData || orderToEdit) && (
        <PaymentModal
          order={(activeOrderData || orderToEdit)!}
          breakdown={breakdown}
          onClose={() => setShowPaymentModal(false)}
          onProcessPayment={async (total, method, tendered) => {
            const orderId = (activeOrderData || orderToEdit)?.id;
            if (!orderId) return;

            await processPayment(orderId, {
              id: `txn_${Date.now()}`,
              orderId,
              amount: total,
              payment_method: method,
              status: 'PAID',
              timestamp: new Date(),
              processedBy: 'POS',
              tenderedAmount: tendered,
              changeGiven: tendered ? tendered - total : 0
            } as any);

            // After successful payment
            resetPad();
            setShowPaymentModal(false);
          }}
        />
      )}

      {/* Receipt Preview Modal */}
      <ReceiptPreviewModal
        isOpen={showReceiptPreview}
        onClose={() => setShowReceiptPreview(false)}
        order={{
          id: activeOrderId || 'NEW',
          order_number: activeOrderData?.order_number || 'PREVIEW',
          status: activeOrderData?.status || 'DRAFT',
          type: orderType,
          timestamp: new Date(),
          customer_name: customerName,
          customer_phone: customerPhone,
          delivery_address: deliveryAddress,
          guest_count: guestCount,
          table: tables.find(t => t.id === selectedTableId),
          table_id: selectedTableId,
          order_items: currentOrderItems,
          // Flatten breakdown for the receipt component
          total: breakdown.total,
          tax: breakdown.tax,
          service_charge: breakdown.serviceCharge,
          delivery_fee: breakdown.deliveryFee,
          discount: breakdown.discount,
          // Fill other required fields with defaults
          created_at: new Date(),
          updated_at: new Date(),
          restaurant_id: currentUser?.restaurant_id || ''
        } as Order}
      />

      {/* Floating Details Modal */}
      {showDetailsModal && (
        <DetailsModal
          orderType={orderType}
          setOrderType={setOrderType}
          customerPhone={customerPhone}
          setCustomerPhone={setCustomerPhone}
          customerName={customerName}
          setCustomerName={setCustomerName}
          deliveryAddress={deliveryAddress}
          setDeliveryAddress={setDeliveryAddress}
          selectedTableId={selectedTableId}
          setSelectedTableId={setSelectedTableId}
          guestCount={guestCount}
          setGuestCount={setGuestCount}
          tables={tables}
          isCustomerLoading={isCustomerLoading}
          setShowDetailsModal={setShowDetailsModal}
        />
      )}
    </div>
  );
};

// --- EXTERNAL MODAL COMPONENT (Prevents Re-render Blur) ---

interface DetailsModalProps {
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  customerPhone: string;
  setCustomerPhone: (p: string) => void;
  customerName: string;
  setCustomerName: (n: string) => void;
  deliveryAddress: string;
  setDeliveryAddress: (a: string) => void;
  selectedTableId: string;
  setSelectedTableId: (id: string) => void;
  guestCount: number;
  setGuestCount: (c: number) => void;
  tables: any[];
  isCustomerLoading: boolean;
  setShowDetailsModal: (s: boolean) => void;
}

const DetailsModal: React.FC<DetailsModalProps> = ({
  orderType, setOrderType, customerPhone, setCustomerPhone,
  customerName, setCustomerName, deliveryAddress, setDeliveryAddress,
  selectedTableId, setSelectedTableId, guestCount, setGuestCount,
  tables, isCustomerLoading, setShowDetailsModal
}) => {
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
      <div className="bg-slate-900 p-8 rounded-3xl w-full max-w-lg border border-slate-800">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white font-bold text-xl">Session Configuration</h2>
          <X onClick={() => setShowDetailsModal(false)} className="text-slate-500 cursor-pointer" />
        </div>

        <div className="space-y-6">
          <div className="flex gap-2">
            {['DINE_IN', 'TAKEAWAY', 'DELIVERY'].map(t => (
              <button
                key={t}
                onClick={() => setOrderType(t as any)}
                className={`flex-1 py-3 rounded-xl border font-bold text-xs transition-all ${orderType === t ? 'bg-gold-500 border-gold-500 text-black' : 'border-slate-800 text-slate-500 hover:border-slate-700'}`}
              >
                {t}
              </button>
            ))}
          </div>

          {orderType === 'DINE_IN' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold">Table</label>
                <select
                  className="w-full bg-black border border-slate-700 rounded-lg p-3 text-white mt-1"
                  value={selectedTableId}
                  onChange={e => setSelectedTableId(e.target.value)}
                >
                  <option value="">Select Table</option>
                  {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold">Guests</label>
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => setGuestCount(Math.max(1, guestCount - 1))} className="p-3 bg-slate-800 rounded-lg text-white"><Minus size={16} /></button>
                  <span className="flex-1 text-center font-bold text-white text-xl">{guestCount}</span>
                  <button onClick={() => setGuestCount(guestCount + 1)} className="p-3 bg-slate-800 rounded-lg text-white"><Plus size={16} /></button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Use CustomerQuickAdd for TAKEAWAY orders */}
              {orderType === 'TAKEAWAY' && (
                <CustomerQuickAdd
                  customerPhone={customerPhone}
                  customerName={customerName}
                  onPhoneChange={setCustomerPhone}
                  onNameChange={setCustomerName}
                  isLoading={isCustomerLoading}
                  matchedCustomers={[]} // TODO: Implement customer matching
                  onSelectCustomer={(customer: { phone: string; name?: string }) => {
                    setCustomerPhone(customer.phone);
                    setCustomerName(customer.name || '');
                  }}
                />
              )}

              {/* Standard inputs for DELIVERY orders */}
              {orderType === 'DELIVERY' && (
                <>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase font-bold flex justify-between">
                      Phone Number
                      {isCustomerLoading && <Loader2 size={12} className="animate-spin text-gold-500" />}
                    </label>
                    <input
                      autoFocus
                      className="w-full bg-black border border-slate-700 rounded-lg p-3 text-white mt-1 font-mono tracking-widest focus:border-gold-500 outline-none"
                      placeholder="03XXXXXXXXX"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      type="tel"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase font-bold">Name</label>
                    <input
                      className="w-full bg-black border border-slate-700 rounded-lg p-3 text-white mt-1 focus:border-gold-500 outline-none"
                      placeholder="Guest Name"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase font-bold">Address</label>
                    <textarea
                      className="w-full bg-black border border-slate-700 rounded-lg p-3 text-white mt-1 min-h-[80px] focus:border-gold-500 outline-none"
                      placeholder="Full Delivery Address..."
                      value={deliveryAddress}
                      onChange={e => setDeliveryAddress(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => setShowDetailsModal(false)}
            className="w-full py-4 bg-white text-black rounded-xl font-black tracking-widest hover:bg-slate-200"
          >
            CONFIRM CONFIGURATION
          </button>
        </div>
      </div>
    </div>
  );
};