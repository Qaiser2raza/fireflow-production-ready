import React, { useState, useMemo, useEffect } from 'react';
import { MenuItem, OrderItem, OrderType } from '../../shared/types';
import { useAppContext } from '../../client/contexts/AppContext';
import {
  Search,
  X,
  Edit2,
  Plus,
  Minus,
  Loader2,
  Utensils,
  Flame,
  ShoppingBag,
  Bike,
  Banknote,
  Printer,
  CreditCard,
  Clock,
  CheckCircle2,
  CheckSquare,
  History,
  Eye
} from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { useThermalPrinter } from '../../hooks/useThermalPrinter';
// import { CustomerQuickAdd } from './components/CustomerQuickAdd';
import { TokenDisplayBanner } from './components/TokenDisplayBanner';
import { RecallModal } from '../dashboard/components/RecallModal';
import { MenuItemCard } from './components/MenuItemCard';
import { FloatingCartBadge } from './components/FloatingCartBadge';
import { PaymentModal } from './components/PaymentModal';
import { ReceiptPreviewModal } from '../../shared/components/ReceiptPreviewModal';
import { ReceiptView } from './ReceiptView';
import { Order } from '../../shared/types';
import { calculateBill, getDefaultBillConfig, BillConfig } from '../../lib/billEngine';

export const POSView: React.FC = () => {
  const {
    addOrder, updateOrder, orders,
    orderToEdit, setOrderToEdit, setActiveView, currentUser, menuItems, menuCategories,
    tables, addNotification, customers, processPayment, addCustomer, operationsConfig
  } = useAppContext();

  // UI & Order State
  // Default to 'trending' (Most Selling)
  const [activeCategory, setActiveCategory] = useState<string>('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingField, setEditingField] = useState<'discount' | 'delivery' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTokenBanner, setShowTokenBanner] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [estimatedPickupTime, setEstimatedPickupTime] = useState<Date | undefined>(undefined);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false); // Mobile-only: cart bottom sheet
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); // Mobile breakpoint detection

  // Order Details State
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeOrderNumber, setActiveOrderNumber] = useState<string | null>(null);
  const [isRecallOpen, setIsRecallOpen] = useState(false);
  const [currentOrderItems, setCurrentOrderItems] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>(currentUser?.role === 'CASHIER' ? 'TAKEAWAY' : 'DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [guestCount, setGuestCount] = useState<number>(2);
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [isCustomerLoading, setIsCustomerLoading] = useState(false);

  const debouncedPhone = useDebounce(customerPhone, 400);

  // Bill Config — per-session billing overrides (discount, service, tax, delivery)
  const [billConfig, setBillConfig] = useState<BillConfig>(() =>
    getDefaultBillConfig('DINE_IN', operationsConfig || {})
  );

  // Reset bill config to order-type defaults when order type changes
  // v3.1: Skip reset if we are currently loading an order to edit (recall)
  useEffect(() => {
    if (orderToEdit) return; 
    setBillConfig(getDefaultBillConfig(orderType, operationsConfig || {}));
  }, [orderType, operationsConfig, orderToEdit]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Global Barcode Listener
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      
      // Barcode scanners are fast. If time between keys is > 100ms, it's likely manual typing.
      if (currentTime - lastKeyTime > 100) {
        buffer = '';
      }
      
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (buffer.length > 5) { // Minimum order number length
          const scannedNumber = buffer.trim();
          console.log('[POS] Barcode Scanned:', scannedNumber);
          
          // Try to find the order by order_number or ID
          const foundry = orders.find(o => o.order_number === scannedNumber || o.id === scannedNumber);
          if (foundry) {
            setOrderToEdit(foundry);
            addNotification('success', `Recalled Order: ${foundry.order_number || scannedNumber}`);
            if (foundry.payment_status !== 'PAID' && foundry.status !== 'CLOSED') {
                setTimeout(() => setShowPaymentModal(true), 300); // UI needs time to populate order
            }
          }
        }
        buffer = '';
        return;
      }

      // Append alphanumeric keys to buffer
      if (e.key.length === 1 && /[a-zA-Z0-9-]/.test(e.key)) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orders, setOrderToEdit, addNotification]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleShortcuts = (e: KeyboardEvent) => {
      // Don't trigger single-key shortcuts if typing in an input
      const activeElement = document.activeElement;
      const isInputFocused = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;

      // "/" -> Focus Search
      if (e.key === '/' && !isInputFocused) {
        e.preventDefault();
        document.getElementById('pos-search-input')?.focus();
      }

      // "F9" or "Ctrl+Enter" -> Open Checkout/Payment
      if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        if (currentOrderItems.length > 0) {
          setShowPaymentModal(true);
        } else {
          addNotification('info', 'Cart is empty');
        }
      }

      // "F4" or "Alt+P" -> Quick Print
      if (e.key === 'F4' || (e.altKey && e.key.toLowerCase() === 'p')) {
        e.preventDefault();
        // Fire print logic only if there is an active order
        if (activeOrderId || currentOrderItems.length > 0) {
           handlePrint();
        } else {
           addNotification('info', 'Nothing to print');
        }
      }

      // "Alt+N" -> New Order (Reset Pad)
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        resetPad();
        addNotification('info', 'New Order Started');
      }

      // "Escape" -> Close Modals or Clear Pad
      if (e.key === 'Escape') {
        // Just clear pad if no dialogs are likely open
        if (!isInputFocused) {
            resetPad();
        }
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrderItems, activeOrderId]);


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


      // Restore Bill Config (v3.1 Fix: maintain accurate discounts/taxes on recall)
      const savedBreakdown = orderToEdit.breakdown;
      setBillConfig({
        discountType: (orderToEdit as any).discount_type || (savedBreakdown?.discountPercent > 0 ? 'percent' : 'flat'),
        discountValue: (orderToEdit as any).discount_value || orderToEdit.discount || savedBreakdown?.discountValue || savedBreakdown?.discount || 0,
        serviceChargeEnabled: orderToEdit.service_charge !== undefined ? orderToEdit.service_charge > 0 : (savedBreakdown?.serviceCharge > 0),
        serviceChargeRate: (orderToEdit as any).service_charge_rate || savedBreakdown?.serviceChargeRate || 5,
        taxEnabled: orderToEdit.tax !== undefined ? orderToEdit.tax > 0 : (savedBreakdown?.tax > 0),
        taxRate: (orderToEdit as any).tax_rate || savedBreakdown?.taxRate || (operationsConfig?.taxRate ?? 16),
        taxLabel: (orderToEdit as any).tax_label || savedBreakdown?.taxLabel || (operationsConfig?.taxLabel ?? 'GST'),
        taxInclusive: orderToEdit.tax_type === 'INCLUSIVE' || (savedBreakdown?.taxInclusive ?? false),
        deliveryFeeEnabled: orderToEdit.type === 'DELIVERY',
        deliveryFee: orderToEdit.delivery_fee || savedBreakdown?.deliveryFee || 0,
      });

      addNotification('info', `Editing Order #${orderToEdit.id.slice(-6)}`);
    }
  }, [orderToEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeOrderData = useMemo(() => activeOrderId ? orders.find(o => o.id === activeOrderId) : null, [activeOrderId, orders]);
  const isAlreadyPaid = activeOrderData?.status === 'CLOSED' || activeOrderData?.payment_status === 'PAID';

  // Customer Lookup logic
  useEffect(() => {
    const cleanPhone = (debouncedPhone || '').replace(/\D/g, '');
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
  }, [debouncedPhone, orderType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live Sync with server (reflect KDS changes in real-time)
  useEffect(() => {
    if (activeOrderId && activeOrderData?.order_items) {
      setCurrentOrderItems(prev => {
        return prev.map(localItem => {
          // Only sync items that already have a server-side ID
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
  }, [activeOrderData?.order_items?.map(i => i.item_status).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

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
        last_action_desc: 'Item served by staff'
      } as any);
      
      addNotification('success', 'Item marked as served');
    } catch (e) {
      addNotification('error', 'Failed to serve item');
    } finally {
      setIsSubmitting(false);
    }
  };

  const breakdown = useMemo(() => {
    return calculateBill(currentOrderItems, billConfig);
  }, [currentOrderItems, billConfig]);

  const allCategories = useMemo(() => {
    const categories: { id: string; name: string }[] = [];
    const seenNames = new Set<string>();

    // Role-based category filtering logic

    menuCategories?.forEach(c => {
      const nameLower = c.name.toLowerCase().trim();
      // Waiter filtering: Hide generic or sensitive categories if needed
      // For now, we allow all except if we want to explicitly restrict some
      // Example: if (isWaiter && c.name === 'Staff Meals') return;
      if (!seenNames.has(nameLower)) {
        categories.push({ id: c.id, name: c.name });
        seenNames.add(nameLower);
      }
    });

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
  }, [menuCategories, menuItems, currentUser]);

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
    setActiveOrderNumber(null);
    setCurrentOrderItems([]);
    setOrderType(currentUser?.role === 'CASHIER' ? 'TAKEAWAY' : 'DINE_IN');
    setSelectedTableId('');
    setGuestCount(2);
    setCustomerPhone('');
    setCustomerName('');
    setDeliveryAddress('');
    setOrderToEdit(null);
    setGeneratedToken(null);
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
                .barcode { font-family: 'Libre Barcode 128', sans-serif; font-size: 40px; margin: 5px 0; }
            </style>
        </head>
        <body>
            <div style="font-family: 'Courier New', Courier, monospace; width: 280px; padding: 10px; text-align: center;">
                <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px;">${currentUser?.restaurant_id ? 'FIREFLOW POS' : 'TOKEN SLIP'}</div>
                <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
                <div style="font-size: 10px; margin-bottom: 10px;">${orderType} ORDER</div>
                
                <div style="font-size: 12px; margin-bottom: 2px;">TOKEN NUMBER</div>
                <div style="font-size: 40px; font-weight: 900; margin-bottom: 5px;">${generatedToken}</div>
                
                <div style="font-size: 10px; margin-bottom: 15px;">Ready In (~): ${readyTime}</div>
                
                ${activeOrderNumber ? `
                    <div style="margin: 15px 0; padding: 5px; border: 1px solid #eee;">
                        <div class="barcode">${activeOrderNumber}</div>
                        <div style="font-size: 9px; margin-top: 2px;">${activeOrderNumber}</div>
                    </div>
                ` : ''}
                
                <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
                <div style="font-size: 9px; color: #555;">Please show this token at the counter.</div>
                <div style="font-size: 8px; margin-top: 5px;">${new Date().toLocaleString()}</div>
            </div>
        </body>
        </html>
      `;
      
      await printReceipt(html);
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
    setIsSubmitting(true);

    // Validations
    if (orderType === 'DINE_IN' && !selectedTableId) {
      addNotification('info', 'Please select a table to fire order.');
      setShowDetailsModal(true);
      setIsSubmitting(false);
      return;
    }
    if ((orderType === 'DELIVERY' || orderType === 'TAKEAWAY') && !customerPhone) {
      addNotification('info', 'Customer Phone helps track orders.');
      setShowDetailsModal(true);
      setIsSubmitting(false);
      return;
    }

    try {
      // --- Customer Auto-Save Logic ---
      if ((orderType === 'DELIVERY' || orderType === 'TAKEAWAY') && customerPhone && customerName) {
        const existing = customers?.find(c => (c.phone || '').replace(/\D/g, '') === customerPhone.replace(/\D/g, ''));
        if (!existing) {
          console.log('[POS] Saving new customer auto-magically...');
          await addCustomer({
            name: customerName,
            phone: customerPhone,
            address: deliveryAddress,
            restaurant_id: currentUser?.restaurant_id
          } as any);
        }
      }

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
        total: breakdown.total,
        discount: breakdown.discount,
        service_charge: breakdown.serviceCharge,
        tax: breakdown.tax,
        delivery_fee: breakdown.deliveryFee,
        breakdown: breakdown
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

          setActiveOrderNumber(result.order_number || null);
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

  const handlePrint = async () => {
    // ⚠️ DO NOT clone DOM or inject app stylesheets — that pulls in dark-mode Tailwind CSS which makes the thermal output solid black.
    // Instead, generate a fully isolated receipt HTML from live state data.
    const invoiceSettings = operationsConfig || JSON.parse(localStorage.getItem(`fireflow_operations_config_${currentUser?.restaurant_id}`) || '{}');
    const isPaid = activeOrderData?.payment_status === 'PAID' || activeOrderData?.status === 'CLOSED';
    const orderItems = currentOrderItems.length > 0 ? currentOrderItems : (activeOrderData?.order_items || []);
    const orderNum = activeOrderData?.order_number || activeOrderId?.slice(-8).toUpperCase() || 'N/A';
    const tableObj = tables.find(t => t.id === selectedTableId) || activeOrderData?.table;

    const fmtCur = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;
    const fmtDate = (d: any) => new Date(d || Date.now()).toLocaleString('en-PK', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });

    const itemRows = orderItems.map(item => `
      <tr>
        <td style="width:8%;padding:2px 0;vertical-align:top;">${item.quantity}</td>
        <td style="width:62%;padding:2px 0;vertical-align:top;text-transform:uppercase;">${item.item_name || item.menu_item?.name || 'Item'}</td>
        <td style="width:30%;padding:2px 0;vertical-align:top;text-align:right;">${fmtCur((item.unit_price || 0) * item.quantity)}</td>
      </tr>
    `).join('');

    const content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt</title>
  <style>
    /* ===== COMPLETELY ISOLATED STYLES — NO APP CSS ===== */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: #ffffff !important;
      color: #000000 !important;
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.4;
    }
    .receipt {
      width: 72mm;
      padding: 2mm 3mm;
      background: #ffffff;
      color: #000000;
    }
    h1 { font-size: 14px; font-weight: 900; text-align: center; text-transform: uppercase; margin-bottom: 2px; }
    .sub { font-size: 9px; text-align: center; margin-bottom: 4px; }
    .dashed { border-top: 1px dashed #000; margin: 5px 0; }
    .badge { font-size: 10px; font-weight: 900; text-align: center; border: 2px solid #000; padding: 2px 10px; display: inline-block; text-transform: uppercase; letter-spacing: 2px; }
    .badge-wrap { text-align: center; margin: 4px 0; }
    .meta { font-size: 9px; margin-bottom: 6px; }
    .meta-row { display: flex; justify-content: space-between; margin: 1px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    thead th { font-size: 9px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px; text-align: left; }
    thead th:last-child { text-align: right; }
    .totals { font-size: 10px; margin-top: 4px; }
    .total-row { display: flex; justify-content: space-between; margin: 1px 0; }
    .grand { font-size: 13px; font-weight: 900; display: flex; justify-content: space-between; border-top: 2px solid #000; padding-top: 4px; margin-top: 4px; }
    .paid-stamp { text-align: center; font-size: 11px; font-weight: 900; border: 2px solid #000; padding: 4px; margin-top: 8px; text-transform: uppercase; letter-spacing: 1px; }
    .footer { font-size: 8px; text-align: center; margin-top: 12px; }
    @page { size: 80mm auto; margin: 0; }
  </style>
</head>
<body>
<div class="receipt">
  <h1>${invoiceSettings.businessName || invoiceSettings.business_name || activeOrderData?.restaurants?.name || 'FIREFLOW POS'}</h1>
  ${(invoiceSettings.businessAddress || invoiceSettings.business_address || activeOrderData?.restaurants?.address) ? `<div class="sub">${invoiceSettings.businessAddress || invoiceSettings.business_address || activeOrderData?.restaurants?.address}</div>` : ''}
  ${(invoiceSettings.businessPhone || invoiceSettings.business_phone || activeOrderData?.restaurants?.phone) ? `<div class="sub">Tel: ${invoiceSettings.businessPhone || invoiceSettings.business_phone || activeOrderData?.restaurants?.phone}</div>` : ''}
  ${(invoiceSettings.ntnNumber || activeOrderData?.restaurants?.ntn) ? `<div class="sub">NTN: ${invoiceSettings.ntnNumber || activeOrderData?.restaurants?.ntn}</div>` : ''}
  <div class="dashed"></div>
  <div class="badge-wrap"><span class="badge">${
    isPaid && (invoiceSettings.ntnNumber || invoiceSettings.tax_id || activeOrderData?.restaurants?.ntn)
      ? 'TAX INVOICE'
      : isPaid
        ? 'CUSTOMER BILL'
        : 'BILL'
  }</span></div>
  <div class="dashed"></div>
  <div class="meta">
    <div class="meta-row"><span>Date:</span><span>${fmtDate(activeOrderData?.created_at)}</span></div>
    <div class="meta-row"><span>Order #:</span><span>${orderNum}</span></div>
    <div class="meta-row"><span>Type:</span><span>${orderType}</span></div>
    ${tableObj ? `<div class="meta-row"><span>Table:</span><span>${tableObj.name}</span></div>` : ''}
    ${customerName ? `<div class="meta-row"><span>Customer:</span><span>${customerName}</span></div>` : ''}
  </div>
  <div class="dashed"></div>
  <table>
    <thead><tr><th>Qty</th><th>Description</th><th style="text-align:right;">Price</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="dashed"></div>
  <div class="totals">
    <div class="total-row"><span>Subtotal</span><span>${fmtCur(breakdown.subtotal)}</span></div>
    ${breakdown.discount > 0 ? `<div class="total-row"><span>Discount</span><span>-${fmtCur(breakdown.discount)}</span></div>` : ''}
    ${breakdown.serviceCharge > 0 ? `<div class="total-row"><span>Service Charge</span><span>${fmtCur(breakdown.serviceCharge)}</span></div>` : ''}
    ${breakdown.tax > 0 ? `<div class="total-row"><span>Tax</span><span>${fmtCur(breakdown.tax)}</span></div>` : ''}
    ${breakdown.deliveryFee > 0 ? `<div class="total-row"><span>Delivery Fee</span><span>${fmtCur(breakdown.deliveryFee)}</span></div>` : ''}
  </div>
  <div class="grand"><span>TOTAL PAYABLE</span><span>${fmtCur(breakdown.total)}</span></div>
  ${isPaid ? `<div class="paid-stamp">✓ PAID — ${activeOrderData?.payment_method || 'CASH'}</div>` : ''}
  <div class="dashed"></div>
  ${invoiceSettings.receiptFooterText || invoiceSettings.receipt_footer ? `<div class="footer">${invoiceSettings.receiptFooterText || invoiceSettings.receipt_footer}</div>` : ''}
  <div class="footer">Powered by Fireflow POS</div>
</div>
</body>
</html>`;

    await printReceipt(content);
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
              id="pos-search-input"
              type="text"
              placeholder="Search Items... (Press /)"
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
            onClick={() => setIsRecallOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-xl text-blue-500 transition-all font-black uppercase text-[10px] tracking-widest shadow-lg mr-2"
          >
            <History size={16} />
            Recall
          </button>

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
      <div className="w-[320px] lg:w-[350px] bg-[#0B0F19] flex flex-col h-full shrink-0 z-20 shadow-2xl relative transition-all">

        {/* Cart Header */}
        <div className="p-3 md:p-4 border-b border-white/5 bg-slate-950/50 backdrop-blur-md pb-2">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-serif font-bold text-white">Current Order</h2>
            <div className="flex gap-2 items-center">
              {activeOrderId ? (
                <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-[9px] font-black uppercase tracking-widest rounded-lg">EDITING</span>
              ) : (
                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-[9px] font-black uppercase tracking-widest rounded-lg">NEW</span>
              )}
              <button onClick={handleClose} className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-500 rounded-lg transition-colors" title="Close"><X size={14} /></button>
            </div>
          </div>

          <button
            onClick={() => setShowDetailsModal(true)}
            className="w-full bg-slate-900 border border-slate-800 p-2 rounded-lg flex items-center justify-between group hover:border-gold-500/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center text-gold-500">
                {orderType === 'DINE_IN' ? <Utensils size={12} /> : orderType === 'DELIVERY' ? <Bike size={12} /> : <ShoppingBag size={12} />}
              </div>
              <div className="text-[10px] font-bold text-white uppercase flex gap-1.5 items-center">
                {!(orderType === 'DINE_IN' && selectedTableId) && <span>{orderType.replace('_', ' ')}</span>}
                {orderType === 'DINE_IN' && (
                  <>
                    {selectedTableId && <span className="text-slate-600 hidden md:inline">•</span>}
                    <span className="text-gold-500 font-black">{tables.find(t => t.id === selectedTableId)?.name || 'Select Table'}</span>
                  </>
                )}
              </div>
            </div>
            <Edit2 size={12} className="text-slate-600 group-hover:text-gold-500" />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
          {currentOrderItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
              <ShoppingBag size={32} className="mb-2" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Cart Empty</span>
            </div>
          ) : (
            currentOrderItems.map((item, idx) => {
              const status = item.item_status || 'DRAFT';
              const isDraft = status === 'DRAFT';
              const isDone = status === 'DONE';
              
              return (
                <div key={`${item.id || item.menu_item_id}-${idx}`} className="bg-slate-900/50 border border-white/5 rounded-lg p-2 flex flex-col group hover:bg-slate-900 transition-all">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded flex items-center justify-center text-white font-black text-xs border shrink-0 ${isDraft ? 'bg-slate-800 border-white/10' : 'bg-gold-500/10 border-gold-500/20 text-gold-500'}`}>
                        {item.quantity}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white uppercase tracking-tight truncate leading-tight flex items-center gap-1.5">
                          {item.item_name}
                          {status !== 'DRAFT' && (
                            <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest flex items-center gap-0.5 ${
                              status === 'PENDING' ? 'bg-blue-500/10 text-blue-400' :
                              status === 'PREPARING' ? 'bg-orange-500/10 text-orange-500' :
                              status === 'DONE' ? 'bg-green-500 text-slate-950' :
                              'bg-slate-800 text-slate-500'
                            }`}>
                              {status === 'PENDING' && <Clock size={6} />}
                              {status === 'PREPARING' && <Flame size={6} className="animate-pulse" />}
                              {status === 'DONE' && <CheckCircle2 size={6} />}
                              {status}
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono italic leading-none">Rs. {item.unit_price}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                       {/* Qty Controls (Hover) */}
                       {isDraft && !isReadOnly && (
                         <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => updateQuantity(item.menu_item_id, -1)} className="w-5 h-5 rounded bg-slate-800 hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center transition-colors"><Minus size={10} /></button>
                           <button onClick={() => updateQuantity(item.menu_item_id, 1)} className="w-5 h-5 rounded bg-slate-800 hover:bg-green-500/20 hover:text-green-500 flex items-center justify-center transition-colors"><Plus size={10} /></button>
                         </div>
                       )}

                       <div className="font-mono text-xs font-bold text-white tracking-tighter w-14 text-right">
                         {(item.quantity * item.unit_price).toLocaleString()}
                       </div>
                    </div>
                  </div>
                  {isDone && (['SERVER', 'WAITER', 'ADMIN', 'MANAGER'].includes(currentUser?.role || '')) && (
                      <button 
                        onClick={() => handleServeItem(item.id!)}
                        className="mt-1 w-full py-1 bg-green-500/10 hover:bg-green-500 hover:text-black text-green-500 text-[8px] font-black uppercase tracking-widest rounded flex items-center justify-center gap-1 transition-all"
                      >
                        <CheckSquare size={10} /> Serve Item
                      </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer / Breakdown */}
        <div className="p-3 bg-[#0B0F19] border-t border-white/5 space-y-2 shrink-0">
          <div className="space-y-1 text-[9px] tracking-widest uppercase font-bold">
            <div className="flex justify-between text-slate-500 items-center">
              <span className="opacity-60">Subtotal</span>
              <span className="text-white font-mono tracking-normal text-right">Rs. {breakdown.subtotal.toLocaleString()}</span>
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-1 my-0.5">
              <div className="flex justify-between items-center text-slate-500 group border-b border-white/5 pb-0.5 relative">
                <div className="flex items-center gap-1">
                  <span className="opacity-60 text-[8px]">Disc</span>
                  {editingField === 'discount' ? (
                    <div className="flex items-center bg-slate-900 rounded border border-white/10 ring-1 ring-blue-500/20">
                      <input
                        type="number"
                        className="bg-transparent w-14 text-[8px] text-white px-1 outline-none font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={billConfig.discountValue || ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setBillConfig(p => ({ ...p, discountValue: e.target.value === '' ? 0 : Number(e.target.value) }))}
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
                        onBlur={() => setEditingField(null)}
                      />
                      <button 
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent blur
                          setBillConfig(p => ({ 
                            ...p, 
                            discountType: p.discountType === 'percent' ? 'flat' : 'percent' 
                          }));
                        }}
                        className={`px-1 py-0.5 rounded-r text-[6px] font-black h-full transition-colors ${billConfig.discountType === 'percent' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                      >
                        {billConfig.discountType === 'percent' ? '%' : 'Rs'}
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setEditingField('discount')}
                      className="px-1 py-0 rounded bg-slate-800 text-blue-400 text-[7px] hover:bg-slate-700 transition-colors"
                    >
                      {billConfig.discountValue > 0 ? (billConfig.discountType === 'percent' ? `${billConfig.discountValue}%` : `Rs.${billConfig.discountValue}`) : '+'}
                    </button>
                  )}
                </div>
                <span className="text-red-400 font-mono tracking-normal">{breakdown.discount > 0 ? `-${breakdown.discount.toLocaleString()}` : '0'}</span>
              </div>

              <div className="flex justify-between items-center text-slate-500 border-b border-white/5 pb-0.5">
                <div className="flex items-center gap-1">
                  <span className="opacity-60 text-gold-500/80 text-[8px]">TAX</span>
                  <button 
                    onClick={() => setBillConfig(p => ({ ...p, taxEnabled: !p.taxEnabled }))}
                    className={`px-1 py-0 rounded text-[7px] ${billConfig.taxEnabled ? 'bg-gold-500 text-black' : 'bg-slate-800 text-slate-500'}`}
                  >
                    {billConfig.taxEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
                <span className="text-white font-mono tracking-normal">{breakdown.tax.toLocaleString()}</span>
              </div>

              {orderType === 'DINE_IN' && (
                <div className="flex justify-between items-center text-slate-500 border-b border-white/5 pb-0.5">
                  <div className="flex items-center gap-1">
                    <span className="opacity-60 text-blue-400 text-[8px]">SRV</span>
                    <button 
                      onClick={() => setBillConfig(p => ({ ...p, serviceChargeEnabled: !p.serviceChargeEnabled }))}
                      className={`px-1 py-0 rounded text-[7px] ${billConfig.serviceChargeEnabled ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-500'}`}
                    >
                      {billConfig.serviceChargeEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <span className="text-white font-mono tracking-normal">{breakdown.serviceCharge.toLocaleString()}</span>
                </div>
              )}

              {orderType === 'DELIVERY' && (
                <div className="flex justify-between items-center text-slate-500 border-b border-white/5 pb-0.5">
                  <div className="flex items-center gap-1">
                    <span className="opacity-60 text-purple-400 text-[8px]">DEL</span>
                    {editingField === 'delivery' ? (
                      <input
                        type="number"
                        className="bg-slate-900 border border-white/10 w-16 text-[8px] text-white px-1 rounded outline-none font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={billConfig.deliveryFee || ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setBillConfig(p => ({ ...p, deliveryFee: e.target.value === '' ? 0 : Number(e.target.value), deliveryFeeEnabled: (e.target.value === '' ? 0 : Number(e.target.value)) >= 0 }))}
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
                        onBlur={() => setEditingField(null)}
                      />
                    ) : (
                      <button 
                        onClick={() => setEditingField('delivery')}
                        className="px-1 py-0 rounded bg-slate-800 text-purple-400 text-[7px]"
                      >
                        {billConfig.deliveryFee > 0 ? `Rs.${billConfig.deliveryFee}` : '±'}
                      </button>
                    )}
                  </div>
                  <span className="text-white font-mono tracking-normal">{breakdown.deliveryFee.toLocaleString()}</span>
                </div>
              )}
            </div>

            {breakdown.taxExemptAmount! > 0 && billConfig.taxEnabled && (
                <div className="text-[7px] text-right text-slate-500 italic lowercase tracking-normal">
                    *incl. Rs. {breakdown.taxExemptAmount!.toLocaleString()} exempt.
                </div>
            )}
          </div>

          <div className="flex justify-between items-baseline pt-1">
            <span className="text-[9px] text-slate-500 font-black tracking-[0.2em] uppercase opacity-60">Total</span>
            <div className="flex flex-col items-end leading-none">
              <span className="text-xl font-black text-white italic tracking-tighter">
                Rs. {breakdown.total.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Actions */}
          {isReadOnly ? (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-center">
              <div className="text-green-500 font-black uppercase tracking-widest text-[10px] mb-1">
                {activeOrderData?.status.replace(/_/g, ' ')}
              </div>
              <button onClick={resetPad} className="mt-1 text-[9px] text-white underline">Start New Order</button>
            </div>
          ) : (
            <div className="flex gap-2 h-10 mt-2">
              {/* Preview Button */}
              <button
                onClick={() => {
                  if (activeOrderData && activeOrderData.payment_status !== 'PAID') {
                    updateOrder({ id: activeOrderId!, is_proforma_printed: true } as any);
                  }
                  setShowReceiptPreview(true);
                }}
                disabled={currentOrderItems.length === 0}
                className="w-10 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-20 flex-shrink-0"
                title="Preview Receipt"
              >
                <Eye size={16} />
              </button>

              {/* Print Button */}
              <button
                onClick={() => {
                  if (activeOrderData && activeOrderData.payment_status !== 'PAID') {
                    updateOrder({ id: activeOrderId!, is_proforma_printed: true } as any);
                  }
                  handlePrint();
                }}
                disabled={currentOrderItems.length === 0}
                className="w-10 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-20 flex-shrink-0"
                title="Print Receipt"
              >
                <Printer size={16} />
              </button>

              {/* Only show Fire/Save if there are DRAFT items */}
              {currentOrderItems.some(i => i.item_status === 'DRAFT') ? (
                <>
                  <button
                    disabled={isSubmitting}
                    onClick={() => handleOrderAction(false)}
                    className="flex-1 bg-slate-900 border border-slate-800/50 h-10 rounded-xl text-slate-500 font-black text-[9px] tracking-[0.2em] hover:bg-slate-800 hover:text-white transition-all active:scale-95 uppercase disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                  >
                    {isSubmitting ? <Loader2 className="animate-spin mx-auto" size={14} /> : 'Save / Update'}
                  </button>

                  <button
                    disabled={isSubmitting}
                    onClick={() => handleOrderAction(true)}
                    className="flex-[2] h-10 rounded-xl text-white font-black text-[9px] tracking-[0.2em] bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 shadow-xl shadow-orange-900/40 transition-all active:scale-95 flex items-center justify-center gap-2 uppercase italic disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
                  >
                    {isSubmitting ? (
                      <><Loader2 className="animate-spin" size={14} /><span>Firing...</span></>
                    ) : (
                      <><Flame size={14} className="animate-pulse" /><span>Fire Order</span></>
                    )}
                  </button>
                </>
              ) : (
                <>
                  {/* No draft items: Show role-based control buttons */}
                  {['SERVER', 'WAITER'].includes(currentUser?.role || '') && activeOrderData?.status === 'READY' && (
                    <button
                      onClick={async () => {
                        setIsSubmitting(true);
                        await updateOrder({ id: activeOrderId!, status: 'BILL_REQUESTED' as any });
                        addNotification('success', 'Bill Requested');
                        setIsSubmitting(false);
                      }}
                      className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[9px] tracking-[0.2em] shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 uppercase"
                    >
                      <CreditCard size={14} />
                      <span>Request Bill</span>
                    </button>
                  )}

                  {/* Payment button for Cashiers/Managers or if specifically ready */}
                  {(['CASHIER', 'MANAGER', 'ADMIN'].includes(currentUser?.role || '') || activeOrderData?.status === 'BILL_REQUESTED') && (
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      className="flex-1 h-10 rounded-xl bg-green-600 hover:bg-green-500 text-white font-black text-[9px] tracking-[0.2em] shadow-xl shadow-green-900/40 transition-all active:scale-95 flex items-center justify-center gap-2 uppercase"
                    >
                      <Banknote size={14} />
                      <span>Settle & Pay</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

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
      </div>

      {/* HIDDEN PRINT AREA */}
      {(activeOrderData || currentOrderItems.length > 0) && (
        <ReceiptView 
          order={(activeOrderData as any) || {
            id: activeOrderId || 'NEW',
            type: orderType,
            order_number: 'NEW',
            created_at: new Date(),
            order_items: currentOrderItems,
            status: 'ACTIVE',
            table: tables.find(t => t.id === selectedTableId),
            customer_name: customerName,
            customer_phone: customerPhone
          }}
          breakdown={breakdown}
          isProforma={!(activeOrderData?.payment_status === 'PAID' || activeOrderData?.status === 'CLOSED')}
          invoiceSettings={operationsConfig || JSON.parse(localStorage.getItem(`fireflow_operations_config_${currentUser?.restaurant_id}`) || '{}')}
        />
      )}

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
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQuantity(item.menu_item_id, -1)} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-red-500/20 active:bg-red-500/30 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"><Minus size={14} /></button>
                        <button onClick={() => updateQuantity(item.menu_item_id, 1)} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-green-500/20 active:bg-green-500/30 text-slate-400 hover:text-green-500 flex items-center justify-center transition-colors"><Plus size={14} /></button>
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
                    <span className="opacity-60 text-gold-500/80">Tax ({operationsConfig?.taxRate ?? 0}%)</span>
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
                  onClick={() => setShowReceiptPreview(true)}
                  disabled={currentOrderItems.length === 0}
                  className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-20 flex-shrink-0"
                  title="Print Preview"
                >
                  <Printer size={18} />
                </button>

                {currentOrderItems.some(i => i.item_status === 'DRAFT') ? (
                  <>
                    <button
                      disabled={isSubmitting}
                      onClick={() => handleOrderAction(false)}
                      className="flex-1 bg-slate-900 border border-slate-800/50 h-10 rounded-xl text-slate-500 font-black text-[9px] tracking-[0.2em] hover:bg-slate-800 hover:text-white transition-all active:scale-95 uppercase"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin mx-auto opacity-50" size={14} /> : 'Save'}
                    </button>

                    <button
                      disabled={isSubmitting}
                      onClick={() => handleOrderAction(true)}
                      className="flex-[2] h-10 rounded-xl text-white font-black text-[9px] tracking-[0.2em] bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 shadow-xl shadow-orange-900/40 transition-all active:scale-95 flex items-center justify-center gap-2 uppercase italic"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : (
                        <>
                          <Flame size={14} className="animate-pulse" />
                          <span>Fire</span>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Role-based mobile actions */}
                    {['SERVER', 'WAITER'].includes(currentUser?.role || '') && activeOrderData?.status === 'READY' && (
                      <button
                        onClick={async () => {
                          setIsSubmitting(true);
                          await updateOrder({ id: activeOrderId!, status: 'BILL_REQUESTED' as any });
                          addNotification('success', 'Bill Requested');
                          setIsSubmitting(false);
                        }}
                        className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[9px] tracking-[0.2em] shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 uppercase"
                      >
                        <CreditCard size={14} />
                        <span>Bill</span>
                      </button>
                    )}

                    {(['CASHIER', 'MANAGER', 'ADMIN'].includes(currentUser?.role || '') || activeOrderData?.status === 'BILL_REQUESTED') && (
                      <button
                        onClick={() => setShowPaymentModal(true)}
                        className="flex-1 h-10 rounded-xl bg-green-600 hover:bg-green-500 text-white font-black text-[9px] tracking-[0.2em] shadow-xl shadow-green-900/40 transition-all active:scale-95 flex items-center justify-center gap-2 uppercase"
                      >
                        <Banknote size={14} />
                        <span>Pay</span>
                      </button>
                    )}
                  </>
                )}
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

      {showPaymentModal && !activeOrderData && !orderToEdit && (
        <PaymentModal
          order={{ id: activeOrderId || 'NEW', total: breakdown.total, type: orderType } as any}
          breakdown={breakdown}
          onClose={() => setShowPaymentModal(false)}
          onProcessPayment={async (amount: number, method: 'CASH' | 'CARD' | 'RAAST' | 'RIDER_WALLET' | 'CUSTOMER_ACCOUNT', tendered?: number, discountReason?: string) => {
            const total = amount;
            const orderId = activeOrderId || `ORD-${Date.now()}`;

            await processPayment(orderId, {
              id: `txn_${Date.now()}`,
              orderId,
              amount: total,
              payment_method: method,
              status: 'PAID',
              timestamp: new Date(),
              processedBy: 'POS',
              tenderedAmount: tendered,
              changeGiven: tendered ? tendered - total : 0,
              breakdown: { ...breakdown, discountReason }
            } as any);
          }}
          onPrintReceipt={async () => {
            await handlePrint();
          }}
          onPaymentCompleteClose={() => {
            resetPad();
            setShowPaymentModal(false);
          }}
        />
      )}
      {showPaymentModal && (activeOrderData || orderToEdit) && (
        <PaymentModal
          order={(activeOrderData || orderToEdit)!}
          breakdown={breakdown}
          onClose={() => setShowPaymentModal(false)}
          onProcessPayment={async (total, method: 'CASH' | 'CARD' | 'RAAST' | 'RIDER_WALLET' | 'CUSTOMER_ACCOUNT', tendered, discountReason) => {
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
              changeGiven: tendered ? tendered - total : 0,
              breakdown: { ...breakdown, discountReason }
            } as any);
          }}
          onPrintReceipt={async () => {
            await handlePrint();
          }}
          onPaymentCompleteClose={() => {
            resetPad();
            setShowPaymentModal(false);
          }}
        />
      )}

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
          currentUser={currentUser}
          customers={customers}
          activeOrderId={activeOrderId}
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
  currentUser: any;
  customers: any[];
  activeOrderId: string | null;
}

const DetailsModal: React.FC<DetailsModalProps> = ({
  orderType, setOrderType, customerPhone, setCustomerPhone,
  customerName, setCustomerName, deliveryAddress, setDeliveryAddress,
  selectedTableId, setSelectedTableId, guestCount, setGuestCount,
  tables, isCustomerLoading, setShowDetailsModal, currentUser, customers,
  activeOrderId
}) => {
  const isWaiter = ['SERVER', 'WAITER'].includes(currentUser?.role || '');
  const allowedTypes = isWaiter ? ['DINE_IN'] : ['DINE_IN', 'TAKEAWAY', 'DELIVERY'];
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-[#0B0F19] p-8 rounded-[2rem] w-full max-w-lg border border-white/5 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-8">
           <div>
             <h2 className="text-white font-serif text-2xl font-bold italic tracking-tight">
               {activeOrderId ? 'Change Table / Context' : 'Booking Logic'}
             </h2>
             <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Session Configuration Control</p>
           </div>
           <button onClick={() => setShowDetailsModal(false)} className="p-2 bg-slate-900 rounded-xl text-slate-400 hover:text-white transition-colors">
             <X size={20} />
           </button>
        </div>

        <div className="space-y-8">
          {/* Order Type Tabs */}
          <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-white/5">
            {allowedTypes.map(t => (
              <button
                key={t}
                onClick={() => setOrderType(t as any)}
                className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                  orderType === t 
                  ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/20' 
                  : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>

          {orderType === 'DINE_IN' ? (
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Available Floor Tables</label>
                <div className="grid grid-cols-4 gap-2">
                  {tables.map(table => (
                    <button
                      key={table.id}
                      onClick={() => setSelectedTableId(table.id)}
                      className={`h-11 rounded-xl text-[10px] font-black transition-all border ${
                        selectedTableId === table.id 
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20' 
                        : 'bg-slate-950 border-white/5 text-slate-500 hover:border-white/10'
                      }`}
                    >
                      {table.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Guest Count</label>
                <div className="flex items-center gap-4 bg-slate-950 p-2 rounded-2xl border border-white/5">
                  <button onClick={() => setGuestCount(Math.max(1, guestCount - 1))} className="w-12 h-12 bg-slate-900 rounded-xl text-white flex items-center justify-center active:scale-90 transition-transform">
                    <Minus size={20} />
                  </button>
                  <span className="flex-1 text-center font-black text-white text-3xl italic">{guestCount}</span>
                  <button onClick={() => setGuestCount(guestCount + 1)} className="w-12 h-12 bg-slate-900 rounded-xl text-white flex items-center justify-center active:scale-90 transition-transform">
                    <Plus size={20} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="relative group">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">
                  Customer Lookup (Phone)
                  {isCustomerLoading && <Loader2 size={10} className="inline ml-2 animate-spin text-gold-500" />}
                </label>
                <input
                  type="tel"
                  placeholder="03xx xxxxxxx"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-gold-500 transition-all font-mono tracking-widest"
                />
                
                {/* Search Results */}
                {customerPhone.length >= 3 && customers?.filter(c => (c.phone || '').includes(customerPhone)).length > 0 && !customers.find(c => c.phone === customerPhone) && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-2xl overflow-hidden z-50 shadow-2xl shadow-black/50">
                    {customers
                      .filter(c => (c.phone || '').includes(customerPhone))
                      .slice(0, 4)
                      .map(c => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setCustomerPhone(c.phone || '');
                            setCustomerName(c.name || '');
                            setDeliveryAddress(c.address || '');
                          }}
                          className="w-full px-5 py-4 text-left hover:bg-slate-800 border-b border-white/5 last:border-0 transition-colors"
                        >
                          <div className="text-sm font-black text-white uppercase">{c.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono tracking-widest mt-1">{c.phone}</div>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Registry Name</label>
                <input
                  type="text"
                  placeholder="Guest Name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-950 border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-gold-500 transition-all uppercase"
                />
              </div>

              {orderType === 'DELIVERY' && (
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Geographic Address</label>
                  <textarea
                    placeholder="Street, Block, House No..."
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-gold-500 transition-all h-28 resize-none"
                  />
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setShowDetailsModal(false)}
            className="w-full py-5 bg-white text-black font-black uppercase tracking-[0.3em] rounded-2xl shadow-xl shadow-white/5 active:scale-95 transition-all mt-4 text-xs"
          >
            Confirm Configuration
          </button>
        </div>
      </div>
    </div>
  );
};