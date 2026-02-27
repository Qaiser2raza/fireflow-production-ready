import React, { useState, useEffect } from 'react';
import { Staff, Order, OrderStatus, Table, Section, MenuItem, MenuCategory, Notification, OrderItem, OrderType, TableStatus, PaymentBreakdown, Customer, Vendor, Station } from '../shared/types';
import { Layout, Grid, LogOut, Settings, Users, Coffee, Bike, ShoppingBag, CreditCard, Utensils, Shield, RefreshCw, Clock, Bell, Moon, Sun } from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      printDeliverySlip: (data: { orderIds: string[]; driverId: string }) => void;
      // Add other electronAPI methods here if needed
    };
  }
}

// --- COMPONENT IMPORTS ---
import { LoginView } from '../auth/views/LoginView';
import { POSView } from '../operations/pos/POSView';
import { ActivityLog } from '../operations/activity/ActivityLog';
import { FloorManagementView as OrderCommandHub } from '../operations/dashboard/FloorManagementView';
import { KDSView } from '../operations/kds/KDSView';
import { LogisticsHub } from '../operations/logistics/LogisticsHub';
import { SuperAdminView } from '../features/saas-hq/SuperAdminView';
import { CustomersView } from '../operations/customers/CustomersView';
import { MenuView } from '../operations/menu/MenuView';
import { DashboardView } from '../operations/dashboard/DashboardView';
import { TransactionsView } from '../operations/transactions/TransactionsView';
import { StaffView } from '../features/settings/StaffView';
import { SettingsView } from '../features/settings/SettingsView';
import { BillingView } from '../features/restaurant/BillingView';
import FinancialCommandCenter from '../operations/finance/FinancialCommandCenter';
import { RoleContextBar } from './components/RoleContextBar';
import { CommandPalette } from './components/CommandPalette';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { PreferencesProvider } from './contexts/PreferencesContext';
import { RestaurantProvider } from './RestaurantContext';

// Services
import { tableService } from '../shared/lib/tableService';
import { socketIO } from '../shared/lib/socketClient';

// --- 1. CONTEXT DEFINITION ---
import { AppContext, useAppContext } from './contexts/AppContext';
export { useAppContext };

// --- 2. PROVIDER (The Logic Layer) ---
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Staff | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [servers, setServers] = useState<Staff[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [drivers, setDrivers] = useState<Staff[]>([]);

  const [stations, setStations] = useState<Station[]>([]);

  const [activeView, setActiveView] = useState('SUPER_ADMIN');
  const [orderToEdit, setOrderToEdit] = useState<Order | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [isRestaurantLoading, setIsRestaurantLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('connected');
  const [lastSyncAt, setLastSyncAt] = useState<Date>(new Date());
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const API_URL = 'http://localhost:3001/api';
  const SERVICE_CHARGE_ENABLED = true;
  const TAX_ENABLED = true;
  const DEFAULT_DELIVERY_FEE = 250;

  // Helper: Get Authorization header with JWT token
  const getAuthHeaders = () => {
    const accessToken = sessionStorage.getItem('accessToken');
    const expiry = sessionStorage.getItem('accessTokenExpiry');

    // Debug log to verify token exists
    console.log('[Auth] Token present:', !!accessToken);

    // Check if token is expired
    if (expiry && Date.now() > parseInt(expiry)) {
      console.log('[Auth] Token expired, clearing session');
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('refreshToken');
      sessionStorage.removeItem('accessTokenExpiry');
      return { 'Content-Type': 'application/json' };
    }

    return {
      'Content-Type': 'application/json',
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
    };
  };

  const fetchInitialData = async (userOverride?: any) => {
    const user = userOverride || currentUser;
    if (!user) return;

    setLoading(true);
    try {
      // Get restaurant_id from multiple sources for redundancy
      const restaurantId = user.restaurant_id ||
        currentUser?.restaurant_id ||
        localStorage.getItem('restaurant_id');

      if (!restaurantId) {
        throw new Error('No restaurant ID available');
      }

      console.log('[Fetch] Using restaurant ID:', restaurantId);

      const headers = getAuthHeaders();

      const fetches = [
        fetch(`${API_URL}/orders?restaurant_id=${restaurantId}`, { headers }),
        fetch(`${API_URL}/tables?restaurant_id=${restaurantId}`, { headers }),
        fetch(`${API_URL}/sections?restaurant_id=${restaurantId}`, { headers }),
        fetch(`${API_URL}/menu_items?restaurant_id=${restaurantId}`, { headers }),
        fetch(`${API_URL}/menu_categories?restaurant_id=${restaurantId}`, { headers }),
        fetch(`${API_URL}/staff?restaurant_id=${restaurantId}`, { headers }),
        fetch(`${API_URL}/transactions?restaurant_id=${restaurantId}`, { headers }),
        fetch(`${API_URL}/customers?restaurant_id=${restaurantId}`, { headers }),
        fetch(`${API_URL}/vendors?restaurant_id=${restaurantId}`, { headers }),
        fetch(`${API_URL}/stations?restaurant_id=${restaurantId}`, { headers })
      ];

      const [ordersRes, tablesRes, sectionsRes, menuRes, catRes, staffRes, trxRes, custDataRes, vendDataRes, stationRes] = await Promise.all(fetches);

      const [ordersData, tablesData, sectionsData, menuData, catData, staffData, trxData, custData, vendData, stationData] = await Promise.all([
        ordersRes.ok ? ordersRes.json() : [],
        tablesRes.ok ? tablesRes.json() : [],
        sectionsRes.ok ? sectionsRes.json() : [],
        menuRes.ok ? menuRes.json() : [],
        catRes.ok ? catRes.json() : [],
        staffRes.ok ? staffRes.json() : [],
        trxRes.ok ? trxRes.json() : [],
        custDataRes.ok ? custDataRes.json() : [],
        vendDataRes.ok ? vendDataRes.json() : [],
        stationRes.ok ? stationRes.json() : []
      ]);

      const mapOrder = (o: any) => {
        const dineIn = o.dine_in_order || (o.dine_in_orders && o.dine_in_orders[0]);
        const takeaway = o.takeaway_order || (o.takeaway_orders && o.takeaway_orders[0]);
        const delivery = o.delivery_order || (o.delivery_orders && o.delivery_orders[0]);

        // Find the table object
        const tableObj = Array.isArray(tables) ? tables.find((t: any) => t.id === (dineIn?.table_id || o.table_id)) : null;

        return {
          ...o,
          total: Number(o.total || 0) > 0 ? Number(o.total) : (o.order_items || []).reduce((acc: number, item: any) => acc + (Number(item.unit_price || 0) * (item.quantity || 0)), 0),
          tax: Number(o.tax || 0),
          service_charge: Number(o.service_charge || 0),
          delivery_fee: Number(o.delivery_fee || 0),
          tableId: dineIn?.table_id || o.table_id || null,
          table: tableObj,
          guestCount: dineIn?.guest_count || o.guest_count || 1,
          customerName: takeaway?.customer_name || delivery?.customer_name || o.customer_name || "Guest",
          customerPhone: takeaway?.customer_phone || delivery?.customer_phone || o.customer_phone || "",
          timestamp: new Date(o.created_at || o.timestamp || Date.now()),
          order_items: (o.order_items || []).map((item: any) => ({
            ...item,
            unit_price: Number(item.unit_price || 0),
            total_price: Number(item.total_price || 0)
          }))
        };
      };

      const mappedOrders = (Array.isArray(ordersData) ? ordersData : []).map(mapOrder);

      setOrders(mappedOrders);
      setTables(Array.isArray(tablesData) ? tablesData : []);
      setSections(Array.isArray(sectionsData) ? sectionsData : []);
      setMenuItems(Array.isArray(menuData) ? menuData.map((m: any) => ({
        ...m,
        price: Number(m.price || 0),
        available: m.is_available ?? m.available ?? true,
        is_available: m.is_available ?? m.available ?? true,
        image_url: m.image_url || m.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80',
        nameUrdu: m.name_urdu,
        name_urdu: m.name_urdu,
        category_rel: m.category_rel
      })) : []);
      setMenuCategories(Array.isArray(catData) ? catData : []);
      setServers(Array.isArray(staffData) ? staffData : []);
      setTransactions(Array.isArray(trxData) ? trxData.map((t: any) => ({ ...t, amount: Number(t.amount) })) : []);
      setDrivers(Array.isArray(staffData) ? staffData.filter((s: any) => s.role === 'RIDER' || s.role === 'DRIVER') : []);
      setCustomers(Array.isArray(custData) ? custData : []);
      setVendors(Array.isArray(vendData) ? vendData : []);
      setStations(Array.isArray(stationData) ? stationData : []);
      setExpenses([]); // TODO: Implement fetch
      setReservations([]); // TODO: Implement fetch
      setConnectionStatus('connected');
      setLastSyncAt(new Date());
    } catch (err) {
      console.error("Sync Failed:", err);
      setConnectionStatus('disconnected');
    } finally {
      setLoading(false);
      setIsRestaurantLoading(false);
    }
  };

  const login = async (pin: string) => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });

      if (!res.ok) throw new Error('Invalid PIN');
      const data = await res.json();
      const user = data.staff;
      const restaurant = data.restaurant;

      // Store restaurant info
      if (restaurant) {
        localStorage.setItem('currentRestaurant', JSON.stringify(restaurant));
        localStorage.setItem('restaurant_id', restaurant.id);
        console.log('[Auth] Restaurant ID stored:', restaurant.id);
      }

      // ✅ Phase 2b: Store JWT tokens if present
      if (data.tokens) {
        sessionStorage.setItem('accessToken', data.tokens.access_token);
        sessionStorage.setItem('refreshToken', data.tokens.refresh_token);
        const expiryTime = Date.now() + (data.tokens.expires_in * 1000);
        sessionStorage.setItem('accessTokenExpiry', expiryTime.toString());
        console.log('[JWT] Tokens stored successfully');
      }

      localStorage.setItem('saved_pin', pin);
      setCurrentUser(user);
      if (user.role === 'SUPER_ADMIN') {
        setActiveView('SUPER_ADMIN');
      } else {
        setActiveView('DASHBOARD');
      }

      // Wait for state to update before fetching data
      setTimeout(() => {
        fetchInitialData(user);
      }, 100);

      return true;
    } catch (err) {
      addNotification('error', "Authentication Failed: Invalid PIN");
      localStorage.removeItem('saved_pin');
      return false;
    }
  };

  const logout = () => {
    // Clear JWT tokens
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('accessTokenExpiry');

    // Clear app state
    setCurrentUser(null);
    setOrders([]);
    setActiveView('DASHBOARD');
    localStorage.removeItem('saved_pin');
  };

  // Validate token on app load
  useEffect(() => {
    const validateToken = async () => {
      const token = sessionStorage.getItem('accessToken');
      const expiry = sessionStorage.getItem('accessTokenExpiry');

      if (token && expiry) {
        if (Date.now() > parseInt(expiry)) {
          console.log('[Auth] Token expired on app load, logging out...');
          logout();
        } else {
          console.log('[Auth] Token valid on app load');
        }
      }
    };

    validateToken();
  }, []);

  useEffect(() => {
    socketIO.connect();

    // 🔑 Join the restaurant room if user is logged in
    if (currentUser?.restaurant_id) {
      socketIO.emit('join', { room: `restaurant:${currentUser.restaurant_id}` });
    }

    // Real-time DB listeners
    socketIO.on('db_change', (payload: any) => {
      console.log("Real-time DB Change:", payload);
      const { table, eventType, data, id } = payload;

      if (table === 'orders') {
        const mapOrderLocal = (o: any) => {
          const dineIn = o.dine_in_order || (o.dine_in_orders && o.dine_in_orders[0]);
          const takeaway = o.takeaway_order || (o.takeaway_orders && o.takeaway_orders[0]);
          const delivery = o.delivery_order || (o.delivery_orders && o.delivery_orders[0]);
          return {
            ...o,
            total: Number(o.total || 0) > 0 ? Number(o.total) : (o.order_items || []).reduce((acc: number, item: any) => acc + (Number(item.unit_price || 0) * (item.quantity || 0)), 0),
            tax: Number(o.tax || 0),
            service_charge: Number(o.service_charge || 0),
            delivery_fee: Number(o.delivery_fee || 0),
            tableId: dineIn?.table_id || o.table_id || null,
            guestCount: dineIn?.guest_count || o.guest_count || 1,
            customerName: takeaway?.customer_name || delivery?.customer_name || o.customer_name || "Guest",
            customerPhone: takeaway?.customer_phone || delivery?.customer_phone || o.customer_phone || "",
            timestamp: new Date(o.created_at || o.timestamp || Date.now()),
            order_items: (o.order_items || []).map((item: any) => ({
              ...item,
              unit_price: Number(item.unit_price || 0),
              total_price: Number(item.total_price || 0)
            }))
          };
        };

        setOrders(prev => {
          if (eventType === 'INSERT' && data) {
            if (prev.some(o => o.id === data.id)) return prev;
            return [...prev, mapOrderLocal(data)];
          }
          if (eventType === 'UPDATE' && data) return prev.map(o => o.id === data.id ? { ...o, ...mapOrderLocal(data) } : o);
          if (eventType === 'DELETE') {
            if (id === 'ALL') return [];  // Factory reset clears all orders
            return prev.filter(o => o.id !== id);
          }
          return prev;
        });
      }

      if (table === 'tables') {
        setTables(prev => {
          if (eventType === 'INSERT' && data) return [...prev, data];
          if (eventType === 'UPDATE') {
            // Handle factory reset broadcast (id: 'ALL')
            if (id === 'ALL') return prev.map(t => ({ ...t, status: 'AVAILABLE', active_order_id: null }));
            if (data) return prev.map(t => t.id === data.id ? { ...t, ...data } : t);
            return prev;
          }
          if (eventType === 'DELETE') {
            if (id === 'ALL') return [];
            return prev.filter(t => t.id !== id);
          }
          return prev;
        });
      }

      if (table === 'sections') {
        setSections(prev => {
          if (eventType === 'INSERT' && data) return [...prev, data];
          if (eventType === 'UPDATE' && data) return prev.map(s => s.id === data.id ? { ...s, ...data } : s);
          if (eventType === 'DELETE') return prev.filter(s => s.id !== id);
          return prev;
        });
      }

      if (table === 'stations') {
        setStations(prev => {
          if (eventType === 'INSERT' && data) return [...prev, data];
          if (eventType === 'UPDATE' && data) return prev.map(s => s.id === data.id ? { ...s, ...data } : s);
          if (eventType === 'DELETE') return prev.filter(s => s.id !== id);
          return prev;
        });
      }

      if (table === 'transactions') {
        setTransactions(prev => {
          if (eventType === 'INSERT' && data) {
            if (prev.some(t => t.id === data.id)) return prev;
            return [{ ...data, amount: Number(data.amount) }, ...prev];
          }
          if (eventType === 'UPDATE' && data) return prev.map(t => t.id === data.id ? { ...t, ...data, amount: Number(data.amount) } : t);
          if (eventType === 'DELETE') return prev.filter(t => t.id !== id);
          return prev;
        });
      }

      if (table === 'staff') {
        const isRider = (s: any) => s && (s.role === 'RIDER' || s.role === 'DRIVER');

        setDrivers(prev => {
          if (eventType === 'INSERT' && data && isRider(data)) return [...prev, data];
          if (eventType === 'UPDATE' && data) {
            const existing = prev.find(s => s.id === data.id);
            if (existing) return prev.map(s => s.id === data.id ? { ...s, ...data } : s);
            if (isRider(data)) return [...prev, data]; // Was not a rider, now is? Or just new.
            return prev;
          }
          if (eventType === 'DELETE') return prev.filter(s => s.id !== id);
          return prev;
        });

        const updateAllStaff = (prev: Staff[]) => {
          if (eventType === 'INSERT' && data) return [...prev, data];
          if (eventType === 'UPDATE' && data) return prev.map(s => s.id === data.id ? { ...s, ...data } : s);
          if (eventType === 'DELETE') return prev.filter(s => s.id !== id);
          return prev;
        };
        setServers(prev => updateAllStaff(prev));
      }

      if (table === 'menu_items') {
        setMenuItems(prev => {
          if (eventType === 'INSERT' && data) return [...prev, data];
          if (eventType === 'UPDATE' && data) return prev.map(i => i.id === data.id ? { ...i, ...data } : i);
          if (eventType === 'DELETE') return prev.filter(i => i.id !== id);
          return prev;
        });
      }

      if (table === 'menu_categories') {
        setMenuCategories(prev => {
          if (eventType === 'INSERT' && data) return [...prev, data];
          if (eventType === 'UPDATE' && data) return prev.map(c => c.id === data.id ? { ...c, ...data } : c);
          if (eventType === 'DELETE') return prev.filter(c => c.id !== id);
          return prev;
        });
      }

      if (table === 'customers') {
        setCustomers(prev => {
          if (eventType === 'INSERT' && data) return [...prev, data];
          if (eventType === 'UPDATE' && data) return prev.map(c => c.id === data.id ? { ...c, ...data } : c);
          if (eventType === 'DELETE') return prev.filter(c => c.id !== id);
          return prev;
        });
      }
    });

    const savedPin = localStorage.getItem('saved_pin');
    if (savedPin && !currentUser) login(savedPin);

    return () => {
      socketIO.off('db_change');
      // We don't call disconnect() here to prevent "flapping" 
      // when React unmounts/remounts during login cycles.
      // The singleton will handle cleanup when needed.
    };
  }, [currentUser]);

  // AUTO-CLEANUP: Delete active orders older than 24 hours (v3.0: DRAFT is now ACTIVE)
  useEffect(() => {
    if (!currentUser) return;

    const cleanupDrafts = async () => {
      const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

      const oldDrafts = orders.filter(o =>
        o.status === 'ACTIVE' && // v3.0: Changed from DRAFT
        (o.order_items || []).length === 0 && // Only cleanup empty active orders
        new Date(o.created_at || o.timestamp || 0).getTime() < cutoffTime
      );

      for (const draft of oldDrafts) {
        try {
          await fetch(`${API_URL}/orders/${draft.id}`, { method: 'DELETE' });
          console.log(`Auto-deleted old empty active order: ${draft.id}`);
        } catch (err) {
          console.error(`Failed to delete order ${draft.id}:`, err);
        }
      }

      if (oldDrafts.length > 0) {
        addNotification('info', `Cleaned up ${oldDrafts.length} old empty order(s)`);
        fetchInitialData();
      }
    };

    // Run cleanup every hour
    const cleanupInterval = setInterval(cleanupDrafts, 60 * 60 * 1000);

    // Run immediately on mount
    cleanupDrafts();

    return () => clearInterval(cleanupInterval);
  }, [currentUser, orders]);

  const addNotification = (type: 'success' | 'error' | 'info' | 'warning', message: string) => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => removeNotification(id), 5000);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const calculateOrderTotal = (items: OrderItem[], type: OrderType, _guests: number, fee: number): PaymentBreakdown => {
    const subtotal = items.reduce((acc, item) => acc + (Number(item.unit_price) * item.quantity), 0);

    // Check if restaurant-specific settings exist4, otherwise use defaults
    const isServiceChargeEnabled = localStorage.getItem('service_charge_enabled') === 'true' || SERVICE_CHARGE_ENABLED;
    const serviceRate = parseFloat(localStorage.getItem('service_charge_rate') || '0.05');

    const isTaxEnabled = localStorage.getItem('tax_enabled') === 'true' || TAX_ENABLED;
    const taxRateSet = parseFloat(localStorage.getItem('tax_rate') || '0.16'); // Common default or from setting

    const serviceCharge = (type === 'DINE_IN' && isServiceChargeEnabled) ? subtotal * serviceRate : 0;
    const tax = isTaxEnabled ? (subtotal + serviceCharge) * taxRateSet : 0;
    const deliveryFee = type === 'DELIVERY' ? (fee || DEFAULT_DELIVERY_FEE) : 0;

    return { subtotal, serviceCharge, tax, deliveryFee, discount: 0, total: subtotal + serviceCharge + tax + deliveryFee };
  };

  const seatGuests = async (tableId: string, guestCount: number) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    // Optimistic Update
    const originalTables = [...tables];
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: TableStatus.OCCUPIED } : t));

    try {
      const existingOrder = orders.find(o => o.table_id === tableId && o.status !== 'CLOSED' && o.payment_status !== 'PAID'); // v3.0 Check Status
      if (existingOrder) {
        // Ensure dine_in_orders is populated for POSView to consume
        const orderWithDineIn = {
          ...existingOrder,
          dine_in_orders: existingOrder.dine_in_orders?.length ? existingOrder.dine_in_orders : [{ table_id: tableId, guest_count: existingOrder.guest_count }]
        };
        setOrderToEdit(orderWithDineIn as any);
        setActiveView('POS');
        return;
      }

      const res = await fetch(`${API_URL}/floor/seat-party`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: currentUser?.restaurant_id,
          tableId,
          guestCount,
          waiterId: currentUser?.id
        })
      });

      if (!res.ok) throw new Error('Seating failed');
      const data = await res.json();

      // Update local state with real data
      const newOrder = {
        ...data.order,
        table_id: data.order.table_id,
        guest_count: data.order.guest_count,
        dine_in_orders: [data.dineInOrder], // Ensure array structure matches normal fetch
        timestamp: new Date()
      };
      setOrders(prev => {
        if (prev.some(o => (o as any).id === (newOrder as any).id)) return prev;
        return [...prev, newOrder as any];
      });
      setOrderToEdit(newOrder as any);
      setActiveView('POS');
      addNotification('success', `Table ${table.name} seated with ${guestCount} guests`);
    } catch (err: any) {
      setTables(originalTables); // Rollback
      addNotification('error', `Seating failed: ${err.message}`);
    }
  };

  return (
    <AppContext.Provider value={{
      currentUser, orders, drivers, tables, sections, servers, transactions, expenses, reservations, menuItems, menuCategories, customers, vendors,
      connectionStatus, lastSyncAt, notifications, activeView, loading, isRestaurantLoading, orderToEdit,
      socket: socketIO,
      setActiveView, setOrderToEdit, addNotification, removeNotification,
      login, logout, fetchInitialData,
      calculateOrderTotal, seatGuests,
      updateTableStatus: async (id: string, status: TableStatus) => {
        const restaurant_id = currentUser?.restaurant_id || localStorage.getItem('restaurant_id');
        await tableService.updateTable(id, { status, restaurant_id: restaurant_id as string });
        await fetchInitialData();
        return true;
      },
      addOrder: async (order: any) => {
        const restaurant_id = currentUser?.restaurant_id || localStorage.getItem('restaurant_id');
        const res = await fetch(`${API_URL}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...order, restaurant_id })
        });
        if (!res.ok) return null;
        const result = await res.json();
        await fetchInitialData();
        return result;
      },
      updateOrder: async (order: any) => {
        const restaurant_id = currentUser?.restaurant_id || localStorage.getItem('restaurant_id');
        const res = await fetch(`${API_URL}/orders/${order.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...order, restaurant_id })
        });
        if (!res.ok) {
          console.error('[AppContext] updateOrder failed:', await res.text());
          return null;
        }
        const result = await res.json();
        await fetchInitialData();
        return result;
      },
      updateOrderStatus: async (id: string, status: OrderStatus) => {
        await fetch(`${API_URL}/orders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        fetchInitialData();
      },
      assignDriverToOrder: async (orderId: string, driverId: string) => {
        await fetch(`${API_URL}/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'READY',
            assigned_driver_id: driverId,
            dispatched_at: new Date()
          })
        });

        // --- 🖨️ HW: Auto-Print Delivery Slip ---
        if (window.electronAPI) {
          window.electronAPI.printDeliverySlip({ orderIds: [orderId], driverId });
        }

        fetchInitialData();
      },
      addMenuItem: async (item: any) => { await fetch(`${API_URL}/menu_items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      updateMenuItem: async (item: any) => {
        const res = await fetch(`${API_URL}/menu_items`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, restaurant_id: currentUser?.restaurant_id }) });
        if (!res.ok) console.error('[App] updateMenuItem failed:', await res.text());
        await fetchInitialData();
      },
      deleteMenuItem: async (id: string) => { await fetch(`${API_URL}/menu_items?id=${id}`, { method: 'DELETE' }); await fetchInitialData(); },
      toggleItemAvailability: async (id: string) => {
        const item = menuItems.find(i => i.id === id);
        if (item) {
          await fetch(`${API_URL}/menu_items`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, restaurant_id: currentUser?.restaurant_id, is_available: !item.is_available }) });
          await fetchInitialData();
        }
      },
      addMenuCategory: async (cat: any) => { await fetch(`${API_URL}/menu_categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cat, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      updateMenuCategory: async (cat: any) => { await fetch(`${API_URL}/menu_categories`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cat, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      deleteMenuCategory: async (id: string) => { await fetch(`${API_URL}/menu_categories?id=${id}`, { method: 'DELETE' }); await fetchInitialData(); },
      addSection: async (sec: any) => { await fetch(`${API_URL}/sections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sec, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      updateSection: async (sec: any) => { await fetch(`${API_URL}/sections`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sec, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      deleteSection: async (id: string) => { await fetch(`${API_URL}/sections?id=${id}`, { method: 'DELETE' }); await fetchInitialData(); },
      addTable: async (tbl: any) => { await fetch(`${API_URL}/tables`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...tbl, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      updateTable: async (tbl: any) => { await fetch(`${API_URL}/tables`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...tbl, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      deleteTable: async (id: string) => { await fetch(`${API_URL}/tables?id=${id}`, { method: 'DELETE' }); await fetchInitialData(); },
      addVendor: async (v: any) => { await fetch(`${API_URL}/vendors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
      addCustomer: async (c: any) => { await fetch(`${API_URL}/customers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...c, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
      updateCustomer: async (c: any) => { await fetch(`${API_URL}/customers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...c, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
      deleteCustomer: async (id: string) => { await fetch(`${API_URL}/customers/${id}`, { method: 'DELETE' }); fetchInitialData(); },

      // Stations CRUD
      stations,
      addStation: async (s: any) => { await fetch(`${API_URL}/stations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
      updateStation: async (s: any) => { await fetch(`${API_URL}/stations`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }); fetchInitialData(); },
      deleteStation: async (id: string) => { await fetch(`${API_URL}/stations?id=${id}`, { method: 'DELETE' }); fetchInitialData(); },
      cancelOrder: async (id: string, reason: string, notes?: string) => {
        try {
          const res = await fetch(`${API_URL}/orders/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'CANCELLED',
              cancellation_reason: reason,
              notes: notes,
              last_action_by: currentUser?.id,
              last_action_desc: `Cancelled: ${reason}`
            })
          });
          if (!res.ok) throw new Error('Cancellation failed');
          fetchInitialData();
          addNotification('success', 'Order cancelled successfully');
          return true;
        } catch (e: any) {
          addNotification('error', e.message);
          return false;
        }
      },
      voidOrder: async (id: string, reason: string, notes: string, refundMethod: string, managerPin: string) => {
        try {
          // 1. Verify Manager PIN first
          const verifyRes = await fetch(`${API_URL}/auth/verify-pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: managerPin, requiredRole: 'MANAGER' })
          });

          if (!verifyRes.ok) {
            const err = await verifyRes.json();
            throw new Error(err.error || 'Manager authorization failed');
          }

          const { staff: manager } = await verifyRes.json();

          // 2. Perform Void
          const res = await fetch(`${API_URL}/orders/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'VOIDED',
              void_reason: reason,
              notes: `${notes} | Refund: ${refundMethod}`,
              last_action_by: manager.id,
              last_action_desc: `Voided by ${manager.name}: ${reason}`,
              authorized_by: manager.id
            })
          });

          if (!res.ok) throw new Error('Void operation failed');
          fetchInitialData();
          addNotification('success', 'Order voided successfully');
          return true;
        } catch (e: any) {
          addNotification('error', e.message);
          return false;
        }
      },
      processPayment: async (orderId: string, transaction: any) => {
        try {
          const res = await fetch(`${API_URL}/orders/${orderId}/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...transaction,
              restaurant_id: currentUser?.restaurant_id,
              staff_id: currentUser?.id
            })
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Payment processing failed');
          }
          fetchInitialData();
          return true;
        } catch (e: any) {
          console.error('Process Payment Error:', e);
          addNotification('error', e.message);
          return false;
        }
      },
    } as any}>
      {children}
    </AppContext.Provider>
  );
};

// --- 3. THE UI CONTENT WRAPPER ---
const AppContent = () => {
  const { currentUser, activeView, setActiveView, login, logout, notifications, fetchInitialData, loading, orders, tables } = useAppContext();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [showDevicePairing, setShowDevicePairing] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // Activation gate: check if this machine is set up
  const [setupStatus, setSetupStatus] = useState<'checking' | 'needs-activation' | 'activated'>('checking');

  useEffect(() => {
    fetch('http://localhost:3001/api/setup/status')
      .then(r => r.json())
      .then(data => setSetupStatus(data.activated ? 'activated' : 'needs-activation'))
      .catch(() => setSetupStatus('activated')); // fallback: show login if server unreachable
  }, []);

  // While we check setup status, show a minimal loading screen
  if (setupStatus === 'checking') {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="flex items-center gap-4 text-slate-500">
          <div className="w-8 h-8 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin" />
          <span className="text-sm font-black uppercase tracking-widest">Starting FireFlow...</span>
        </div>
      </div>
    );
  }

  // Show activation screen if this machine has never been set up
  if (setupStatus === 'needs-activation') {
    const { ActivationView } = require('../features/activation/ActivationView');
    return (
      <ActivationView
        onActivationComplete={() => {
          setSetupStatus('activated');
        }}
      />
    );
  }

  // Live clock update

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcut listener for command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (showDevicePairing) {
    const { DevicePairingVerificationView } = require('../auth/views/DevicePairingVerificationView');
    return (
      <DevicePairingVerificationView
        onPairingSuccess={() => {
          setShowDevicePairing(false);
          // Reload to pick up auth token and proceed to login
          window.location.reload();
        }}
        onCancel={() => setShowDevicePairing(false)}
      />
    );
  }

  if (!currentUser) return <LoginView onLogin={login} onStartPairing={() => setShowDevicePairing(true)} />;

  const menuItems = currentUser.role === 'SUPER_ADMIN' ? [
    { id: 'SUPER_ADMIN', icon: Shield, label: 'Vault Control' },
  ] : [
    { id: 'DASHBOARD', icon: Layout, label: 'Aura Dash' },
    { id: 'ORDER_HUB', icon: Utensils, label: 'Dine-In Order Hub' },
    { id: 'POS', icon: Grid, label: 'POS Control' },
    { id: 'KITCHEN', icon: Coffee, label: 'KDS Feed' },
    { id: 'LOGISTICS', icon: Bike, label: 'Logistics Hub' },
    { id: 'FINANCE', icon: CreditCard, label: 'Finance' },
    { id: 'ACTIVITY', icon: ShoppingBag, label: 'Flow Ops' },
    { id: 'REGISTER', icon: CreditCard, label: 'Register' },
    { id: 'BILLING', icon: CreditCard, label: 'Billing' },
    { id: 'STAFF', icon: Users, label: 'Personnel' },
    { id: 'CUSTOMERS', icon: Users, label: 'Patrons' },
    { id: 'MENU', icon: Coffee, label: 'Menu Lab' },
    { id: 'SETTINGS', icon: Settings, label: 'System' },
  ];

  // Command palette commands
  const commands = [
    // Navigation
    { id: 'nav-dashboard', label: 'Go to Dashboard', shortcut: 'G D', category: 'Navigation', icon: '📊', action: () => setActiveView('DASHBOARD') },
    { id: 'nav-pos', label: 'Go to POS', shortcut: 'G P', category: 'Navigation', icon: '🛒', action: () => setActiveView('POS') },
    { id: 'nav-kitchen', label: 'Go to Kitchen', shortcut: 'G K', category: 'Navigation', icon: '👨‍🍳', action: () => setActiveView('KITCHEN') },
    { id: 'nav-orders', label: 'Go to Dine-In Order Hub', shortcut: 'G O', category: 'Navigation', icon: '🍽️', action: () => setActiveView('ORDER_HUB') },
    { id: 'nav-logistics', label: 'Go to Logistics', shortcut: 'G L', category: 'Navigation', icon: '🚚', action: () => setActiveView('LOGISTICS') },
    { id: 'nav-billing', label: 'Go to Billing', shortcut: 'G B', category: 'Navigation', icon: '💳', action: () => setActiveView('BILLING') },
    { id: 'nav-settlement', label: 'Go to Settlement', shortcut: 'G $', category: 'Navigation', icon: '💰', action: () => setActiveView('SETTLEMENT') },
    { id: 'nav-menu', label: 'Go to Menu', shortcut: 'G M', category: 'Navigation', icon: '☕', action: () => setActiveView('MENU') },
    { id: 'nav-settings', label: 'Go to Settings', shortcut: 'G S', category: 'Navigation', icon: '⚙️', action: () => setActiveView('SETTINGS') },
    // Actions
    { id: 'action-refresh', label: 'Refresh Data', shortcut: 'Ctrl+R', category: 'Actions', icon: '🔄', action: () => fetchInitialData() },
    { id: 'action-theme', label: 'Toggle Theme', shortcut: 'Ctrl+T', category: 'Actions', icon: '🌙', action: toggleTheme },
    { id: 'action-logout', label: 'Logout', shortcut: 'Ctrl+Q', category: 'Actions', icon: '🚪', action: logout },
  ];



  return (
    <div className="flex h-screen bg-[#020617] text-slate-200 overflow-hidden">
      <aside
        className={`bg-[#0B0F19] border-r border-slate-800 flex flex-col flex-shrink-0 z-50 transition-[width] duration-300 ease-in-out ${sidebarExpanded ? 'w-64' : 'w-16'}`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <div className="p-4 flex items-center gap-3 overflow-hidden border-b border-slate-800">
          <div className="bg-gold-500 p-2 rounded-lg text-black font-bold shrink-0">⚡</div>
          <h1 className={`font-serif text-2xl font-bold text-white tracking-tight whitespace-nowrap transition-opacity duration-300 ${sidebarExpanded ? 'opacity-100' : 'opacity-0 w-0'}`}>FIREFLOW</h1>
        </div>
        <nav className="flex-1 px-2 space-y-1 py-4 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${activeView === item.id ? 'bg-gold-500 text-black font-bold' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              <item.icon size={18} className="shrink-0" />
              <span className={`text-xs uppercase tracking-widest whitespace-nowrap transition-all duration-300 ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden'}`}>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto p-2 border-t border-slate-800 space-y-2">
          {/* User Profile in Sidebar */}
          <div className={`p-2 bg-slate-900/40 rounded-xl border border-white/5 transition-all ${sidebarExpanded ? 'mx-1' : 'mx-0 flex justify-center'}`}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-500 to-gold-600 flex items-center justify-center text-white font-black text-xs shrink-0 shadow-lg border border-white/10">
                {currentUser?.image ? (
                  <img src={currentUser.image} alt={currentUser.name} className="w-full h-full rounded-lg object-cover" />
                ) : (
                  <span>{currentUser?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className={`transition-all duration-300 ${sidebarExpanded ? 'opacity-100 min-w-[120px]' : 'opacity-0 w-0 overflow-hidden'}`}>
                <div className="text-white text-[10px] font-black truncate uppercase leading-tight">{currentUser?.name}</div>
                <div className="text-gold-500 text-[8px] font-black uppercase tracking-widest">{currentUser?.role}</div>
              </div>
            </div>
          </div>

          <button onClick={() => fetchInitialData()} className="w-full flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-white text-[10px] font-black uppercase rounded-lg hover:bg-slate-800 transition-all">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className={`tracking-widest transition-all duration-300 ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>Sync</span>
          </button>

          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 text-red-500 hover:bg-red-500/10 text-[10px] font-black uppercase rounded-lg transition-all"
          >
            <LogOut size={14} />
            <span className={`tracking-widest transition-all duration-300 ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 relative bg-slate-950 flex flex-col overflow-hidden">
        {/* Global Header - Redesigned */}
        {activeView !== 'POS' && (
          <header className="bg-[#0B0F19]/98 backdrop-blur-md border-b border-slate-800/50 px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-lg">
            {/* LEFT: Branding + Clock */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-slate-400">
                <Clock size={14} />
                <span className="text-[10px] font-black font-mono">
                  {currentTime.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>

            {/* CENTER: Connection Status */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Live</span>
            </div>

            {/* RIGHT: Notifications + Theme */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 hover:bg-slate-800/50 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              </button>

              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 hover:bg-slate-800/50 rounded-lg transition-colors"
                title="Notifications"
              >
                <Bell size={16} className="text-slate-400" />
                {notifications.length > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {notifications.length}
                  </span>
                )}
              </button>

              <div className="w-px h-6 bg-slate-800 mx-1"></div>

              <button
                onClick={logout}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-all border border-red-500/20 group"
                title="Secure Logout"
              >
                <LogOut size={14} className="group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">Logout</span>
              </button>
            </div>
          </header>
        )}

        {/* Role Context Bar - Hidden in POS to maximize space */}
        {activeView !== 'POS' && (
          <RoleContextBar
            currentUser={currentUser}
            pendingBills={orders.filter((o: Order) => o.status === 'READY').length}
            activeTables={tables.filter((t: Table) => t.status === TableStatus.OCCUPIED).length}
            pendingOrders={orders.filter(o => {
              // v3.0 logic: Exclude finished or aborted orders
              if (['CLOSED', 'CANCELLED', 'VOIDED'].includes(o.status)) {
                return false;
              }
              return true;
            }).length}
          />
        )}

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          {activeView === 'SUPER_ADMIN' ? <SuperAdminView /> :
            activeView === 'ORDER_HUB' ? <OrderCommandHub /> :
              activeView === 'MENU' ? <MenuView /> :
                activeView === 'DASHBOARD' ? <DashboardView /> :
                  activeView === 'POS' ? <POSView /> :
                    activeView === 'KITCHEN' ? <KDSView /> :
                      activeView === 'LOGISTICS' ? <LogisticsHub /> :
                        activeView === 'ACTIVITY' ? <ActivityLog /> :
                          activeView === 'REGISTER' ? <TransactionsView /> :
                            activeView === 'BILLING' ? <BillingView /> :
                              activeView === 'FINANCE' ? <FinancialCommandCenter /> :
                                activeView === 'STAFF' ? <StaffView /> :
                                  activeView === 'CUSTOMERS' ? <CustomersView /> :
                                    activeView === 'SETTINGS' ? <SettingsView /> :
                                      <div className="p-20 text-slate-700 font-black uppercase tracking-[0.3em]">SECURE SECTOR NOT SELECTED</div>}
        </div>
      </main>

      {/* Global Notifications UI */}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2">
        {notifications.map(n => (
          <div key={n.id} className={`p-4 rounded-lg shadow-2xl border ${n.type === 'error' ? 'bg-red-900/80 border-red-500' : 'bg-slate-900/80 border-gold-500'} text-white text-xs font-bold uppercase tracking-widest animate-in slide-in-from-right`}>
            {n.message}
          </div>
        ))}
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={commands}
      />
    </div>
  );
};

// --- 4. FINAL BOOTSTRAP ---
const App = () => (
  <ThemeProvider>
    <PreferencesProvider>
      <RestaurantProvider>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </RestaurantProvider>
    </PreferencesProvider>
  </ThemeProvider>
);

export default App;