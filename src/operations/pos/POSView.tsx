import React, { useState, useMemo, useEffect } from 'react';
import { MenuItem, OrderItem, OrderType } from '../../shared/types';
import { useAppContext } from '../../client/contexts/AppContext';
import { Search, X, Edit2, Plus, Minus, Loader2, Utensils, Flame, ShoppingBag, Bike, Users, Banknote, Printer, History } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { CustomerQuickAdd } from './components/CustomerQuickAdd';
import { TokenDisplayBanner } from './components/TokenDisplayBanner';
import { MenuItemCard } from './components/MenuItemCard';
import { FloatingCartBadge } from './components/FloatingCartBadge';
import { PaymentModal } from './components/PaymentModal';
import { ReceiptPreviewModal } from '../../shared/components/ReceiptPreviewModal';
import { calculateBill, getDefaultBillConfig } from '../../lib/billEngine';
import { RecentOrdersModal } from './components/RecentOrdersModal';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

export const POSView: React.FC = () => {
  const {
    addOrder, updateOrder, fireOrder, orders,
    orderToEdit, setOrderToEdit, setActiveView, currentUser, menuItems, menuCategories,
    tables, addNotification, customers, processPayment, operationsConfig
  } = useAppContext();

  // UI & Order State
  const [activeCategory, setActiveCategory] = useState<string>('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTokenBanner, setShowTokenBanner] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [estimatedPickupTime, setEstimatedPickupTime] = useState<Date | undefined>(undefined);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Breakdown Interaction States (v4.0)
  const [taxEnabled, setTaxEnabled] = useState(true);
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(true);
  const [discountValue, setDiscountValue] = useState(0);
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>('flat');
  const [discountReason, setDiscountReason] = useState('');
  const [deliveryFeeEnabled, setDeliveryFeeEnabled] = useState(false);
  const [deliveryFeeValue, setDeliveryFeeValue] = useState(0);

  // Order Details State
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [currentOrderItems, setCurrentOrderItems] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>(currentUser?.role === 'CASHIER' ? 'TAKEAWAY' : 'DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [guestCount, setGuestCount] = useState<number>(2);
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [isCustomerLoading, setIsCustomerLoading] = useState(false);
  const [activeSession, setActiveSession] = useState<any>(null);

  const debouncedPhone = useDebounce(customerPhone, 400);

  const activeOrderData = useMemo(() => 
    activeOrderId ? orders.find(o => o.id === activeOrderId) : null
  , [activeOrderId, orders]);

  const isAlreadyPaid = useMemo(() => 
    activeOrderData?.status === 'CLOSED' || activeOrderData?.payment_status === 'PAID'
  , [activeOrderData]);

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRecentOrders, setShowRecentOrders] = useState(false);

  // Track mobile breakpoint
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setShowMobileCart(false); // Hide mobile cart on desktop
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (orderToEdit) {
      // Guard: Only load if it's a different order OR if we don't have items yet
      if (activeOrderId === orderToEdit.id && currentOrderItems.length > 0) {
        return; 
      }

      console.log('[POS] Loading order to edit:', orderToEdit.id);
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
        setCustomerId(orderToEdit.customer_id || null);
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
        setCustomerId(match.id);
        addNotification('success', `✓ Customer Found: ${match.name}`);
      }
      setIsCustomerLoading(false);
    } else if (cleanPhone.length === 0) {
      setCustomerName('');
      setDeliveryAddress('');
      setCustomerId(null);
    }
  }, [debouncedPhone, orderType]); // Removed customers/addNotification from deps to prevent re-runs resetting manual name input



  // DATA SYNC & RECOVERY
  useEffect(() => {
    // 1. Calculate Base Defaults from System Config
    const cfg = operationsConfig || {};
    const baseType = orderToEdit?.type || orderType;
    const typeDefaults = cfg.order_type_defaults?.[baseType];

    const defaultTax = typeDefaults ? Boolean(typeDefaults.tax_enabled) : Boolean(cfg.taxEnabled ?? cfg.tax_enabled ?? true);
    const defaultSrv = typeDefaults ? Boolean(typeDefaults.svc_enabled) : (baseType === 'DINE_IN');
    const defaultDisc = Number(typeDefaults?.discount_max ?? 0);
    const defaultDiscType = 'percent'; // discount_max is always percent in settings
    const defaultDelivery = typeDefaults ? (Number(typeDefaults.delivery_fee) > 0) : (baseType === 'DELIVERY');

    if (orderToEdit) {
      setOrderType(orderToEdit.type);
      if (orderToEdit.type === 'DINE_IN') setSelectedTableId(orderToEdit.tableId || orderToEdit.table_id || '');
      
      // Load persisting overrides OR fallback to system defaults (Enriched breakdown v4.2)
      const editOrder = orderToEdit as any;
      const savedBreakdown = editOrder.breakdown || {};
      
      setTaxEnabled(savedBreakdown.tax_enabled ?? (Number(orderToEdit.tax) > 0 ? true : defaultTax));
      setServiceChargeEnabled(savedBreakdown.service_charge_enabled ?? (Number(orderToEdit.service_charge) > 0 ? true : defaultSrv));
      setDeliveryFeeEnabled(savedBreakdown.delivery_fee_enabled ?? (Number(orderToEdit.delivery_fee) > 0 ? true : (orderToEdit.type === 'DELIVERY')));
      
      setDiscountValue(savedBreakdown.discount_value ?? (editOrder.discount_value || (Number(orderToEdit.discount || 0)) || defaultDisc));
      setDiscountType(savedBreakdown.discount_type ?? (editOrder.discount_type || defaultDiscType));
      setDiscountReason(editOrder.discount_reason || editOrder.discountReason || '');
      
      setDeliveryFeeValue(Number(orderToEdit.delivery_fee || savedBreakdown.deliveryFee || typeDefaults?.delivery_fee || cfg.default_delivery_fee || 0));
    } else {
      // New Order - strictly follow defaults
      setTaxEnabled(defaultTax);
      setServiceChargeEnabled(defaultSrv);
      setDiscountValue(defaultDisc);
      setDiscountType(defaultDiscType);
      setDiscountReason('');
      setDeliveryFeeEnabled(defaultDelivery);
      setDeliveryFeeValue(Number(typeDefaults?.delivery_fee || cfg.default_delivery_fee || cfg.defaultDeliveryFee || 0));
    }
  }, [orderToEdit, orderType, operationsConfig]);

  // Session Management
  useEffect(() => {
    if (currentUser?.role === 'CASHIER') {
      checkActiveSession();
    }
  }, [currentUser]);

  const checkActiveSession = async () => {
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth(`${(window.location.origin + '/api')}/cashier/current?restaurantId=${currentUser.restaurant_id}&staffId=${currentUser.id}`);
      const data = await res.json();
      if (data.success && data.session) {
        setActiveSession(data.session);
      }
    } catch (e) {
      console.error('Session check failed', e);
    }
  };

  const breakdown = useMemo(() => {
    const cfg = operationsConfig || {};
    const config = getDefaultBillConfig(orderType, cfg);
    
    // Resolve discount to flat amount (BillEngine now expects flat)
    const subtotal = currentOrderItems.reduce((acc, item) => acc + (Number(item.unit_price) * item.quantity), 0);
    const resolvedDiscount = discountType === 'percent' 
      ? (subtotal * (discountValue / 100))
      : discountValue;

    return calculateBill(currentOrderItems, {
      ...config,
      taxEnabled,
      svcEnabled: serviceChargeEnabled,
      svcRate: config.svcRate,
      discountValue: resolvedDiscount,
      deliveryFee: deliveryFeeEnabled ? deliveryFeeValue : 0,
      taxExempt: false // Main view doesn't handle exempt override, SettlementModal does
    });
  }, [currentOrderItems, orderType, operationsConfig, taxEnabled, serviceChargeEnabled, discountType, discountValue, deliveryFeeEnabled, deliveryFeeValue]);

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
    setCustomerId(null);
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
        customer_id: customerId,
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
                onSelect={() => {
                  addToOrder(item);
                  if (isMobile) setShowMobileCart(true);
                }}
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRecentOrders(true)}
                className="p-1.5 bg-slate-800 hover:bg-gold-500/20 text-slate-400 hover:text-gold-500 rounded-lg transition-colors"
                title="Recent Orders (Recall)"
              >
                <History size={16} />
              </button>
              <button
                onClick={handleClose}
                className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
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
          {/* Interactive Breakdown Details */}
          <div className="space-y-3">
            {/* Subtotal */}
            <div className="flex justify-between text-[9px] font-black tracking-widest uppercase text-slate-500">
              <span className="opacity-60">Subtotal</span>
              <span className="text-white font-mono tracking-normal text-xs italic">Rs. {breakdown.subtotal.toLocaleString()}</span>
            </div>

            {/* Discount Row */}
            <div className="flex items-center justify-between group">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black tracking-widest uppercase text-slate-500 opacity-60">Disc</span>
                <div className="flex items-center bg-slate-900 border border-white/5 rounded-lg overflow-hidden h-6 ml-auto">
                  <input 
                    type="number" 
                    value={discountValue === 0 ? '' : discountValue} 
                    onChange={(e) => setDiscountValue(e.target.value === '' ? 0 : Number(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className="w-12 bg-transparent text-center text-[10px] font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0"
                  />
                </div>
                <button 
                  onClick={() => setDiscountType(prev => prev === 'flat' ? 'percent' : 'flat')}
                  className="px-1.5 py-0.5 rounded bg-slate-800 text-[8px] font-black text-gold-500 border border-white/5 hover:bg-slate-700 transition-colors uppercase"
                >
                  {discountType === 'flat' ? 'Rs' : '%'}
                </button>
              </div>
              <span className="text-red-500 font-mono text-[11px] font-bold">-{Math.round(breakdown.discount).toLocaleString()}</span>
            </div>

            {/* Service Charge & Tax Toggles */}
            <div className="flex gap-4">
               {/* Tax Toggle */}
               <div className="flex-1 flex items-center justify-between bg-slate-900/40 p-1 px-2 rounded-lg border border-white/5">
                <span className={`text-[8px] font-black tracking-widest uppercase transition-colors ${taxEnabled ? 'text-gold-500' : 'text-slate-600'}`}>Tax</span>
                <button 
                  onClick={() => setTaxEnabled(!taxEnabled)}
                  className={`w-6 h-3 rounded-full relative transition-all duration-300 ${taxEnabled ? 'bg-gold-500/20 border-gold-500/30' : 'bg-slate-800 border-slate-700'} border`}
                >
                  <div className={`absolute top-0.5 w-1.5 h-1.5 rounded-full transition-all duration-300 ${taxEnabled ? 'right-0.5 bg-gold-500' : 'left-0.5 bg-slate-600'}`} />
                </button>
                <span className="text-[9px] font-bold text-white ml-2">{Math.round(breakdown.tax).toLocaleString()}</span>
              </div>

              {/* Service Toggle */}
              <div className="flex-1 flex items-center justify-between bg-slate-900/40 p-1 px-2 rounded-lg border border-white/5">
                <span className={`text-[8px] font-black tracking-widest uppercase transition-colors ${serviceChargeEnabled ? 'text-blue-400' : 'text-slate-600'}`}>Srv</span>
                <button 
                  onClick={() => setServiceChargeEnabled(!serviceChargeEnabled)}
                  className={`w-6 h-3 rounded-full relative transition-all duration-300 ${serviceChargeEnabled ? 'bg-blue-400/20 border-blue-400/30' : 'bg-slate-800 border-slate-700'} border`}
                >
                  <div className={`absolute top-0.5 w-1.5 h-1.5 rounded-full transition-all duration-300 ${serviceChargeEnabled ? 'right-0.5 bg-blue-400' : 'left-0.5 bg-slate-600'}`} />
                </button>
                <span className="text-[9px] font-bold text-white ml-2">{Math.round(breakdown.serviceCharge).toLocaleString()}</span>
              </div>
            </div>

            {deliveryFeeEnabled && (
              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black tracking-widest uppercase text-blue-400 opacity-60">Delivery Fee</span>
                  <div className="flex items-center bg-slate-900 border border-white/5 rounded-lg overflow-hidden h-6 ml-auto">
                    <input 
                      type="number" 
                      value={deliveryFeeValue === 0 ? '' : deliveryFeeValue} 
                      onChange={(e) => setDeliveryFeeValue(e.target.value === '' ? 0 : Number(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      className="w-16 bg-transparent text-center text-[10px] font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="0"
                    />
                  </div>
                </div>
                <span className="text-white font-mono text-[11px] font-bold">Rs. {breakdown.deliveryFee.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Total Section */}
          <div className="flex justify-between items-baseline border-t border-white/5 pt-4">
            <span className="text-[9px] text-slate-500 font-black tracking-[0.3em] uppercase opacity-40 italic">Total</span>
            <div className="flex flex-col items-end leading-none">
              <span className="text-3xl font-black text-white italic tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
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
                onClick={async () => {
                  const payload: any = {
                    type: orderType,
                    items: currentOrderItems,
                    customer_name: customerName,
                    delivery_address: deliveryAddress,
                    table_id: selectedTableId,
                    session_id: activeSession?.id,
                    breakdown: {
                      total: breakdown.total,
                      tax: breakdown.tax,
                      serviceCharge: breakdown.serviceCharge,
                      discount: breakdown.discount,
                      deliveryFee: breakdown.deliveryFee,
                      tax_enabled: taxEnabled,
                      service_charge_enabled: serviceChargeEnabled,
                      delivery_fee_enabled: deliveryFeeEnabled,
                      discount_type: discountType,
                      discount_value: discountValue
                    }
                  };

                  setIsSubmitting(true);
                  try {
                    if (activeOrderId) {
                      await updateOrder({ ...payload, id: activeOrderId });
                      addNotification('success', 'Order updated successfully');
                    } else {
                      const result = await addOrder(payload);
                      if (result?.id) {
                        setActiveOrderId(result.id);
                        addNotification('success', 'Order saved successfully');
                      }
                    }
                  } catch (err: any) {
                    addNotification('error', err.message);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="flex-1 bg-slate-900 border border-slate-800/50 h-10 rounded-xl text-slate-500 font-black text-[9px] tracking-[0.2em] hover:bg-slate-800 hover:text-white transition-all active:scale-95 disabled:opacity-20 uppercase"
              >
                {isSubmitting ? <Loader2 className="animate-spin mx-auto opacity-50" size={14} /> : 'Save / Update'}
              </button>

              <button
                disabled={currentOrderItems.length === 0 || isSubmitting}
                onClick={async () => {
                  const hasUnfiredItems = currentOrderItems.some(i => i.item_status === 'DRAFT');

                  if (hasUnfiredItems) {
                    // Quick fire logic
                    const payload: any = {
                      type: orderType,
                      items: currentOrderItems,
                      discount_reason: 'Fire Order',
                      guest_count: guestCount,
                      customer_phone: customerPhone,
                      customer_name: customerName,
                      delivery_address: deliveryAddress,
                      table_id: selectedTableId,
                      session_id: activeSession?.id,
                      breakdown: {
                        total: breakdown.total,
                        tax: breakdown.tax,
                        serviceCharge: breakdown.serviceCharge,
                        discount: breakdown.discount,
                        deliveryFee: breakdown.deliveryFee,
                        tax_enabled: taxEnabled,
                        service_charge_enabled: serviceChargeEnabled,
                        delivery_fee_enabled: deliveryFeeEnabled,
                        discount_type: discountType,
                        discount_value: discountValue
                      }
                    };
                    
                    setIsSubmitting(true);
                    try {
                      if (activeOrderId) {
                        await updateOrder({ ...payload, id: activeOrderId, status: 'ACTIVE' });
                        await fireOrder(activeOrderId, orderType);
                      } else {
                        const result = await addOrder({ ...payload, status: 'ACTIVE' });
                        if (result?.id) {
                          setActiveOrderId(result.id);
                          await fireOrder(result.id, orderType);
                        }
                      }
                      addNotification('success', 'Order fired to kitchen!');
                    } catch (e: any) {
                      addNotification('error', e.message);
                    } finally {
                      setIsSubmitting(false);
                    }
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
            orderType={orderType}
            estimatedReadyTime={estimatedPickupTime}
            onPrintToken={() => addNotification('info', 'Printer not connected')}
            onNewOrder={() => {
              setShowTokenBanner(false);
              resetPad();
            }}
          />
        )}
      </div>

      {/* MOBILE-ONLY: Cart Bottom Sheet Modal */}
      {isMobile && showMobileCart && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/50">
          {/* Backdrop */}
          <div 
            className="flex-1 touch-none"
            onClick={() => setShowMobileCart(false)}
          />
          
          {/* Bottom Sheet */}
          <div className="bg-[#0B0F19] rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* Drag Handle */}
            <div className="flex justify-center py-2 bg-slate-950/50 border-b border-white/5">
              <div className="w-12 h-1 bg-slate-700 rounded-full" />
            </div>

            {/* Cart Content (Same as Desktop) */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
              {currentOrderItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                  <ShoppingBag size={40} className="mb-3" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">Cart Empty</span>
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

            {/* Breakdown & Actions (Same as Desktop) */}
            <div className="p-4 bg-[#0B0F19] border-t border-white/5 space-y-3">
              <div className="space-y-1 text-[8px] font-black tracking-widest uppercase">
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

              <div className="flex justify-between items-baseline border-t border-white/5 pt-2">
                <span className="text-[8px] text-slate-500 font-black tracking-[0.3em] uppercase opacity-60">Total</span>
                <span className="text-lg font-black text-white italic tracking-tighter">Rs. {breakdown.total.toLocaleString()}</span>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={currentOrderItems.length === 0 || isSubmitting}
                  onClick={() => handleOrderAction(false)}
                  className="flex-1 bg-slate-900 border border-slate-800/50 h-10 rounded-xl text-slate-500 font-black text-[9px] tracking-[0.2em] hover:bg-slate-800 hover:text-white transition-all active:scale-95 disabled:opacity-20 uppercase"
                >
                  {isSubmitting ? <Loader2 className="animate-spin mx-auto opacity-50" size={14} /> : 'Save'}
                </button>

                <button
                  disabled={currentOrderItems.length === 0 || isSubmitting}
                  onClick={() => {
                    const hasUnfiredItems = currentOrderItems.some(i => i.item_status === 'DRAFT');
                    hasUnfiredItems ? handleOrderAction(true) : setShowPaymentModal(true);
                  }}
                  className={`flex-[1.5] h-10 rounded-xl text-white font-black text-[9px] tracking-[0.2em] shadow-xl transition-all active:scale-95 disabled:opacity-20 flex items-center justify-center gap-2 uppercase italic ${currentOrderItems.some(i => i.item_status === 'DRAFT') ? 'bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 shadow-orange-900/40' : 'bg-green-600 hover:bg-green-500 shadow-green-900/40'}`}
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : (currentOrderItems.some(i => i.item_status === 'DRAFT') ? <><Flame size={14} className="animate-pulse" /><span>Fire</span></> : <><Banknote size={14} /><span>Pay</span></>)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Cart Badge - Mobile Only */}
      {isMobile && !showMobileCart && currentOrderItems.length > 0 && (
        <FloatingCartBadge
          itemCount={currentOrderItems.length}
          total={breakdown.total}
          onClick={() => setShowMobileCart(true)}
          isOpen={showMobileCart}
        />
      )}

      {/* Payment Modal */}
      {showPaymentModal && (activeOrderData || orderToEdit) && (        <PaymentModal
          order={(activeOrderData || orderToEdit)!}
          breakdown={breakdown}
          customer={customers.find(c => c.id === customerId) || { name: customerName, phone: customerPhone, id: customerId }}
          onClose={() => setShowPaymentModal(false)}
          onProcessPayment={async (total, method, tendered, _discountReason, payments, pCustomerId) => {
            const orderId = (activeOrderData || orderToEdit)?.id;
            if (!orderId) return;

            try {
              const finalCustomerId = pCustomerId || customerId;

              await processPayment(orderId, {
                id: `txn_${Date.now()}`,
                orderId,
                amount: total,
                payment_method: method,
                status: 'PAID',
                timestamp: new Date(),
                processedBy: 'POS',
                tenderedAmount: tendered,
                changeGiven: (tendered || 0) > total ? (tendered || 0) - total : 0,
                payments: payments || [{ method, amount: total }],
                customer_id: finalCustomerId,
                tax: breakdown.tax,
                service_charge: breakdown.serviceCharge,
                discount: breakdown.discount,
                delivery_fee: breakdown.deliveryFee,
                tax_enabled: taxEnabled,
                service_charge_enabled: serviceChargeEnabled,
                delivery_fee_enabled: deliveryFeeEnabled
              } as any);

              // After successful payment
              resetPad();
              setShowPaymentModal(false);
            } catch (error) {
              console.error("Payment Error:", error);
            }
          }}
        />
      )}
      {showReceiptPreview && activeOrderId && (
        <ReceiptPreviewModal
          isOpen={showReceiptPreview}
          onClose={() => setShowReceiptPreview(false)}
          order={{
            id: activeOrderId,
            order_number: activeOrderData?.order_number || 'PREVIEW',
            status: activeOrderData?.status || 'DRAFT',
            type: orderType,
            created_at: new Date(),
            customer_name: customerName,
            customer_phone: customerPhone,
            delivery_address: deliveryAddress,
            guest_count: guestCount,
            table: tables.find(t => t.id === selectedTableId),
            order_items: currentOrderItems,
            total: breakdown.total,
            tax: breakdown.tax,
            service_charge: breakdown.serviceCharge,
            delivery_fee: breakdown.deliveryFee,
            discount: breakdown.discount,
            restaurant_id: currentUser?.restaurant_id || ''
          } as any}
        />
      )}

      {showRecentOrders && (
        <RecentOrdersModal 
          isOpen={showRecentOrders}
          onClose={() => setShowRecentOrders(false)}
          orders={orders}
          activeSession={activeSession}
          onEditOrder={(order) => {
            setOrderToEdit(order);
            setShowRecentOrders(false);
          }}
          onPrintReceipt={(order) => {
             setActiveOrderId(order.id);
             setShowReceiptPreview(true);
             setShowRecentOrders(false);
          }}
        />
      )}


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
                  <button onClick={() => setGuestCount(Math.max(1, guestCount - 1))} className="p-2 bg-slate-800 rounded-lg text-white hover:bg-slate-700"><Minus size={14} /></button>
                  <input 
                    type="number"
                    value={guestCount === 0 ? '' : guestCount}
                    onChange={(e) => setGuestCount(e.target.value === '' ? 0 : Number(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 bg-black border border-slate-700 rounded-lg p-2 text-center font-bold text-white text-lg focus:border-gold-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0"
                  />
                  <button onClick={() => setGuestCount(guestCount + 1)} className="p-2 bg-slate-800 rounded-lg text-white hover:bg-slate-700"><Plus size={14} /></button>
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