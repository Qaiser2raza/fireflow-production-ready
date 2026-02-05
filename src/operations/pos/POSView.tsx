import React, { useState, useMemo, useEffect } from 'react';
import { MenuItem, OrderItem, OrderStatus, OrderType, ItemStatus } from '../../shared/types';
import { useAppContext } from '../../client/contexts/AppContext';
import { Search, X, Edit2, Plus, Minus, Loader2, Utensils, Flame, ShoppingBag, Smartphone, Bike, Users } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { CustomerQuickAdd } from './components/CustomerQuickAdd';
import { TokenDisplayBanner } from './components/TokenDisplayBanner';
import { MenuItemCard } from './components/MenuItemCard';

const generateSensibleId = () => {
  const now = new Date();
  const timePart = now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  const randomPart = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ORD-${timePart}-${randomPart}`;
};

export const POSView: React.FC = () => {
  const {
    addOrder, updateOrder, calculateOrderTotal, orders,
    orderToEdit, currentUser, menuItems, menuCategories,
    tables, addNotification, customers
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
      if (orderToEdit.type === 'DINE_IN' && orderToEdit.dine_in_orders?.[0]) {
        setSelectedTableId(orderToEdit.dine_in_orders[0].table_id || '');
        setGuestCount(orderToEdit.dine_in_orders[0].guest_count || 2);
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
  const isAlreadyPaid = activeOrderData?.status === OrderStatus.PAID;

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
    let items = menuItems || [];

    // Most Selling (Trending) Logic
    if (activeCategory === 'trending') {
      return items.filter(i => i.available !== false).slice(0, 20); // Show top 20 as trending
    }

    // Standard Category Filtering
    if (activeCategory && activeCategory !== 'trending' && activeCategory !== 'all') {
      items = items.filter(i =>
        i.category === activeCategory ||
        i.category_id === activeCategory
      );
    }

    const safeQuery = searchQuery.toLowerCase();
    if (safeQuery) items = items.filter(i => i.name.toLowerCase().includes(safeQuery));
    return items;
  }, [activeCategory, searchQuery, menuItems, allCategories]);

  // Auto-select 'trending' if none selected
  useEffect(() => {
    if (!activeCategory) {
      setActiveCategory('trending');
    }
  }, [activeCategory]);

  const resetPad = () => {
    setActiveOrderId(null);
    setCurrentOrderItems([]);
    setCustomerPhone('');
    setCustomerName('');
    setDeliveryAddress('');
    setOrderType(currentUser?.role === 'CASHIER' ? 'TAKEAWAY' : 'DINE_IN');
    setSelectedTableId('');
    setGuestCount(2);
    setIsSubmitting(false);
  };

  const addToOrder = (item: MenuItem) => {
    if (!item.available || isAlreadyPaid) return;
    setCurrentOrderItems(prev => {
      const existingIndex = prev.findIndex(i => i.menu_item_id === item.id && i.item_status === ItemStatus.DRAFT);
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
        item_status: ItemStatus.DRAFT,
        unit_price: item.price,
        total_price: item.price,
        category: item.category,
        station: item.station,
        station_id: item.station_id
      } as any, ...prev];
    });
  };

  const updateQuantity = (menuItemId: string, delta: number) => {
    if (isAlreadyPaid) return;
    setCurrentOrderItems(prev => {
      const index = prev.findIndex(i => i.menu_item_id === menuItemId && i.item_status === ItemStatus.DRAFT);
      if (index === -1) return prev;

      const newItems = [...prev];
      const newQty = newItems[index].quantity + delta;

      if (newQty <= 0) {
        return newItems.filter((_, i) => i !== index);
      }

      newItems[index] = { ...newItems[index], quantity: newQty };
      return newItems;
    });
  };

  const handleOrderAction = async (targetStatus: OrderStatus) => {
    // Validation: Check if order has items
    if (currentOrderItems.length === 0) {
      addNotification('error', '❌ Cannot create empty order. Add items first.');
      return;
    }

    if (isSubmitting) return;

    // Validation: For DINE_IN orders, table MUST be selected
    if (orderType === 'DINE_IN' && !selectedTableId) {
      addNotification('error', '❌ Please select a table for dine-in orders');
      return;
    }

    // Validation: For DELIVERY, phone number is MANDATORY
    if (orderType === 'DELIVERY' && !customerPhone) {
      addNotification('error', '❌ Customer phone number is mandatory for delivery orders');
      setShowDetailsModal(true); // Open modal to help user add phone
      return;
    }

    // Validation: For TAKEAWAY, customer phone is recommended
    if (orderType === 'TAKEAWAY' && !customerPhone && targetStatus !== OrderStatus.DRAFT) {
      const proceed = window.confirm('No customer phone provided. Continue anyway?');
      if (!proceed) return;
    }

    setIsSubmitting(true);

    // Map items to proper status
    const finalItems = currentOrderItems.map(item => ({
      ...item,
      item_status: targetStatus === OrderStatus.DRAFT ? ItemStatus.DRAFT : ItemStatus.FIRED,
      status: undefined
    }));

    const orderData = {
      id: activeOrderId || generateSensibleId(),
      status: targetStatus === OrderStatus.DRAFT ? OrderStatus.DRAFT : OrderStatus.CONFIRMED,
      type: orderType,
      items: finalItems,
      total: breakdown.total,
      table_id: orderType === 'DINE_IN' ? selectedTableId : undefined,
      guest_count: orderType === 'DINE_IN' ? guestCount : undefined,
      customer_phone: customerPhone || undefined,
      customer_name: customerName || undefined,
      delivery_address: orderType === 'DELIVERY' ? deliveryAddress : undefined,
      restaurant_id: currentUser?.restaurant_id
    };

    try {
      const success = (activeOrderId && !activeOrderId.startsWith('ORD-')) ? await updateOrder(orderData) : await addOrder(orderData);

      if (success) {
        // Show different messages based on action
        if (targetStatus === OrderStatus.DRAFT) {
          addNotification('success', '💾 Draft saved successfully');
        } else if (targetStatus === OrderStatus.CONFIRMED || targetStatus === OrderStatus.FIRED) {
          addNotification('success', '🔥 Order fired to kitchen!');
        }

        // For TAKEAWAY orders, show token banner instead of immediate reset
        if (orderType === 'TAKEAWAY' && (targetStatus === OrderStatus.CONFIRMED || targetStatus === OrderStatus.FIRED)) {
          // Wait for context update then find the created order
          setTimeout(() => {
            const createdOrder = orders.find(order => order.id === (activeOrderId || orderData.id));
            const takeawayInfo = createdOrder?.takeaway_orders?.[0];

            if (takeawayInfo?.token_number) {
              setGeneratedToken(takeawayInfo.token_number);
              setEstimatedPickupTime(
                takeawayInfo.pickup_time ? new Date(takeawayInfo.pickup_time) : undefined
              );
              setShowTokenBanner(true);
            } else {
              // Fallback if token not found
              resetPad();
            }
          }, 300);
        } else {
          resetPad();
        }
      }
    } catch (error: any) {
      console.error('Order action error:', error);

      // User-friendly error messages
      let errorMessage = '❌ Failed to save order';
      if (error?.message?.includes('Foreign key')) {
        errorMessage = '❌ Invalid table selected. Please refresh and try again.';
      } else if (error?.message?.includes('table_id')) {
        errorMessage = '❌ Table selection error. Please select a valid table.';
      } else if (error?.message) {
        errorMessage = `❌ Error: ${error.message}`;
      }

      addNotification('error', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };



  return (
    <div className="flex h-full w-full bg-slate-950 flex-col md:flex-row overflow-hidden">
      {/* MENU SIDE */}
      <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden">
        {/* Top Management Bar */}
        <div className="flex flex-col gap-3">
          {/* Search Row */}
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 h-10">
            <Search className="text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search items..."
              className="bg-transparent outline-none text-white w-full text-xs font-black placeholder:text-slate-700"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Category Bar: Working Style */}
          <div className="relative group">
            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar-h no-scrollbar items-center">


              <button
                onClick={() => setActiveCategory('trending')}
                className={`px-6 py-2.5 rounded-2xl text-[10px] font-black tracking-[0.2em] transition-all duration-300 whitespace-nowrap border-2 ${activeCategory === 'trending'
                  ? 'bg-gold-500 border-gold-500 text-black'
                  : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                  }`}
              >
                MOST SELLING
              </button>

              <button
                onClick={() => setActiveCategory('all')}
                className={`px-6 py-2.5 rounded-2xl text-[10px] font-black tracking-[0.2em] transition-all duration-300 whitespace-nowrap border-2 ${activeCategory === 'all'
                  ? 'bg-gold-500 border-gold-500 text-black'
                  : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                  }`}
              >
                ALL ITEMS
              </button>

              <div className="w-px h-6 bg-slate-800 mx-1" />
              {allCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-6 py-2.5 rounded-2xl text-[10px] font-black tracking-[0.2em] transition-all duration-300 whitespace-nowrap border-2 ${activeCategory === cat.id
                    ? 'bg-gold-500 border-gold-500 text-black'
                    : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                    }`}
                >
                  {cat.name.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5 overflow-y-auto pr-2 custom-scrollbar">
          {filteredItems.map(item => (
            <MenuItemCard
              key={item.id}
              item={item}
              onSelect={addToOrder}
              showCategory={activeCategory === 'all' || activeCategory === 'trending'}
            />
          ))}
        </div>
      </div>

      {/* PAD SIDE */}
      <div className="md:w-[400px] bg-[#0A0D14] border-l border-white/5 flex flex-col shadow-2xl relative z-10">
        <div className="p-4 border-b border-white/5 bg-slate-900/40">
          <div className="flex flex-col gap-4">
            {/* Top Row: Type Selectors (Icon-Only Radio Style) */}
            <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5 gap-1.5">
              {[
                { id: 'DINE_IN', icon: Users, title: 'Dine-In' },
                { id: 'TAKEAWAY', icon: Smartphone, title: 'Takeaway' },
                { id: 'DELIVERY', icon: Bike, title: 'Delivery' }
              ].map((t) => {
                const Icon = t.icon;
                const isActive = orderType === t.id;
                const isHighlighted = isActive && t.id === 'DINE_IN' && !!selectedTableId;

                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      // Accidental Click Prevention: If already in DINE_IN with a table, confirm before switching
                      if (orderType === 'DINE_IN' && t.id !== 'DINE_IN' && selectedTableId) {
                        const tableName = tables.find(tbl => tbl.id === selectedTableId)?.name || 'the table';
                        const confirmed = window.confirm(`⚠️ Switching to ${t.title} will release ${tableName}. Are you sure?`);
                        if (!confirmed) return;
                      }

                      // If switching AWAY from DINE_IN, clear table context
                      if (orderType === 'DINE_IN' && t.id !== 'DINE_IN') {
                        setSelectedTableId('');
                        setGuestCount(1);
                      }
                      setOrderType(t.id as OrderType);
                    }}
                    title={t.title}
                    className={`flex-1 flex items-center justify-center py-3 rounded-xl transition-all duration-300 ${isActive
                      ? (isHighlighted ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/20' : 'bg-white text-black shadow-xl')
                      : 'text-slate-500 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    <Icon size={18} className={isActive ? 'animate-pulse' : ''} />
                  </button>
                );
              })}
            </div>

            {/* Bottom Row: Dynamic Context Info */}
            <div className="flex justify-between items-center px-1">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-slate-500 font-black uppercase tracking-[0.2em]">Live Session</span>
                  {isSubmitting && <Loader2 size={10} className="animate-spin text-gold-500" />}
                </div>
                <div className="text-white text-xs font-black uppercase tracking-tight mt-0.5">
                  {orderType === 'DINE_IN' ? (
                    <div className="flex items-center gap-2 text-gold-500">
                      <Utensils size={12} />
                      <span>{selectedTableId ? `Table: ${tables.find(t => t.id === selectedTableId)?.name || '...'}` : 'Select Table'}</span>
                    </div>
                  ) : orderType === 'TAKEAWAY' ? (
                    <div className="flex items-center gap-2 text-white">
                      <Smartphone size={12} className="text-slate-500" />
                      <span>{customerPhone || customerName || 'WALK-IN CUSTOMER'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-blue-400">
                      <Bike size={12} />
                      <span>{customerPhone ? `${customerPhone}${customerName ? ` - ${customerName}` : ''}` : 'PHONE REQUIRED'}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowDetailsModal(true)}
                  className="w-10 h-10 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-gold-500 hover:border-gold-500/50 transition-all active:scale-95 shadow-lg group"
                  title="Configure Session"
                >
                  <Edit2 size={16} className="group-hover:scale-110 transition-transform" />
                </button>
                <button
                  onClick={resetPad}
                  className="w-10 h-10 rounded-xl bg-red-500/5 border border-red-500/10 flex items-center justify-center text-red-500/40 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/30 transition-all active:scale-95 shadow-lg group"
                  title="Reset Pad"
                >
                  <X size={16} className="group-hover:rotate-90 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
          {currentOrderItems.map((item, i) => (
            <div key={i} className="flex flex-col gap-2 p-3 rounded-[1.25rem] bg-slate-900/40 border border-white/5 hover:border-gold-500/20 transition-all shadow-inner">
              <div className="flex justify-between items-start">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center justify-center bg-gold-500/10 rounded-xl w-8 h-8 border border-gold-500/20">
                    <span className="text-gold-500 font-black text-xs">{item.quantity}</span>
                  </div>
                  <div>
                    <div className="text-white text-[11px] font-black uppercase tracking-tight leading-tight">{item.item_name || item.menu_item?.name || 'Unknown Item'}</div>
                    <div className="text-[8px] text-slate-500 font-black uppercase tracking-widest mt-0.5 opacity-60">
                      {item.category || item.menu_item?.category || 'General'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white font-black text-[11px] tracking-tight italic">
                    Rs. {(item.unit_price * item.quantity).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Quantity Controls */}
              {item.item_status === ItemStatus.DRAFT && (
                <div className="flex items-center gap-2 mt-0.5 border-t border-white/5 pt-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); updateQuantity(item.menu_item_id, -1); }}
                    className="w-6 h-6 flex items-center justify-center bg-slate-800/80 rounded-lg text-slate-400 hover:bg-red-500/20 hover:text-red-500 transition-all active:scale-90"
                  >
                    <Minus size={10} />
                  </button>
                  <span className="text-[10px] font-black text-white w-4 text-center font-mono">{item.quantity}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); updateQuantity(item.menu_item_id, 1); }}
                    className="w-6 h-6 flex items-center justify-center bg-slate-800/80 rounded-lg text-slate-400 hover:bg-gold-500/20 hover:text-gold-500 transition-all active:scale-90"
                  >
                    <Plus size={10} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {currentOrderItems.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-800 py-32">
              <ShoppingBag size={64} className="mb-6 opacity-5" />
              <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Your pad is empty</p>
            </div>
          )}
        </div>

        <div className="p-6 bg-[#0B0F19] border-t border-white/5 space-y-4">
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
          </div>

          <div className="flex justify-between items-baseline border-t border-white/5 pt-4">
            <span className="text-[9px] text-slate-500 font-black tracking-[0.3em] uppercase opacity-60">Total</span>
            <div className="flex flex-col items-end leading-none">
              <span className="text-2xl font-black text-white italic tracking-tighter">
                Rs. {breakdown.total.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              disabled={currentOrderItems.length === 0 || isSubmitting}
              onClick={() => handleOrderAction(OrderStatus.DRAFT)}
              className="flex-1 bg-slate-900 border border-slate-800/50 h-10 rounded-xl text-slate-500 font-black text-[9px] tracking-[0.2em] hover:bg-slate-800 hover:text-white transition-all active:scale-95 disabled:opacity-20 uppercase"
            >
              {isSubmitting ? <Loader2 className="animate-spin mx-auto opacity-50" size={14} /> : 'Save'}
            </button>

            <button
              disabled={currentOrderItems.length === 0 || isSubmitting}
              onClick={() => handleOrderAction(OrderStatus.CONFIRMED)}
              className="flex-[2] bg-gradient-to-br from-orange-500 to-red-600 h-10 rounded-xl text-white font-black text-[9px] tracking-[0.2em] hover:from-orange-400 hover:to-red-500 shadow-xl shadow-orange-900/40 transition-all active:scale-95 disabled:opacity-20 flex items-center justify-center gap-2 uppercase italic"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : (
                <>
                  <Flame size={14} className="animate-pulse" />
                  <span>Fire</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

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

      {showTokenBanner && generatedToken && (
        <TokenDisplayBanner
          token={generatedToken}
          estimatedReadyTime={estimatedPickupTime}
          onPrintToken={() => {
            addNotification('info', 'Print functionality coming soon');
          }}
          onNewOrder={() => {
            setShowTokenBanner(false);
            resetPad();
          }}
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