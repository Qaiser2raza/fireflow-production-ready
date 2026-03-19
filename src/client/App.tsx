import React, { useState, useEffect } from 'react';
import { Staff, Order, OrderStatus, Table, Section, MenuItem, MenuCategory, Notification, OrderItem, OrderType, TableStatus, PaymentBreakdown, Customer, Vendor, Station } from '../shared/types';
import { Layout, Grid, LogOut, Settings, Coffee, Bike, CreditCard, Utensils, Shield, RefreshCw, Clock, Bell, Moon, Sun, Menu, X, History } from 'lucide-react';
import { useIsMobile } from './hooks/useIsMobile';
import { fetchWithAuth } from '../shared/lib/authInterceptor';
import { calculateBill, getDefaultBillConfig } from '../lib/billEngine';

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
import { POSViewMobile } from '../operations/pos/POSViewMobile';
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
import { getDeviceFingerprint } from '../shared/lib/deviceFingerprint';
import { getBilingualMessage } from '../shared/lib/userMessages';

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
  const [activeSession, setActiveSession] = useState<any | null>(null);

  const [activeView, setActiveView] = useState('LOGIN');
  const [orderToEdit, setOrderToEdit] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRestaurantLoading, setIsRestaurantLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [lastSyncAt, setLastSyncAt] = useState<Date>(new Date());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [operationsConfig, setOperationsConfig] = useState<any>(null);

  const API_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

  // Helper: Get Authorization header with JWT token
  const getAuthHeaders = () => {
    const accessToken = sessionStorage.getItem('accessToken');
    const expiry = sessionStorage.getItem('accessTokenExpiry');
    

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
      

      
      const headers = getAuthHeaders();
      
      const fetches = [
        fetchWithAuth(`${API_URL}/orders?restaurant_id=${restaurantId}`, { headers }),
        fetchWithAuth(`${API_URL}/tables?restaurant_id=${restaurantId}`, { headers }),
        fetchWithAuth(`${API_URL}/sections?restaurant_id=${restaurantId}`, { headers }),
        fetchWithAuth(`${API_URL}/menu_items?restaurant_id=${restaurantId}`, { headers }),
        fetchWithAuth(`${API_URL}/menu_categories?restaurant_id=${restaurantId}`, { headers }),
        fetchWithAuth(`${API_URL}/staff?restaurant_id=${restaurantId}`, { headers }),
        fetchWithAuth(`${API_URL}/transactions?restaurant_id=${restaurantId}`, { headers }),
        fetchWithAuth(`${API_URL}/customers?restaurant_id=${restaurantId}`, { headers }),
        fetchWithAuth(`${API_URL}/vendors?restaurant_id=${restaurantId}`, { headers }),
        fetchWithAuth(`${API_URL}/stations?restaurant_id=${restaurantId}`, { headers }),
        fetchWithAuth(`${API_URL}/operations/config/${restaurantId}`, { headers })
      ];
      
      const [ordersRes, tablesRes, sectionsRes, menuRes, catRes, staffRes, trxRes, custDataRes, vendDataRes, stationRes, configRes] = await Promise.all(fetches);

      const [ordersData, tablesData, sectionsData, menuData, catData, staffData, trxData, custData, vendData, stationData, configData] = await Promise.all([
        ordersRes.ok ? ordersRes.json() : [],
        tablesRes.ok ? tablesRes.json() : [],
        sectionsRes.ok ? sectionsRes.json() : [],
        menuRes.ok ? menuRes.json() : [],
        catRes.ok ? catRes.json() : [],
        staffRes.ok ? staffRes.json() : [],
        trxRes.ok ? trxRes.json() : [],
        custDataRes.ok ? custDataRes.json() : [],
        vendDataRes.ok ? vendDataRes.json() : [],
        stationRes.ok ? stationRes.json() : [],
        configRes.ok ? configRes.json() : null
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
      if (configData && configData.success) {
        setOperationsConfig(configData.config);
        localStorage.setItem(`fireflow_operations_config_${restaurantId}`, JSON.stringify(configData.config));
      }
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
      const deviceFingerprint = getDeviceFingerprint();
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pin,
            device_fingerprint: deviceFingerprint,
            device_name: `${navigator.platform || 'Device'} - ${new Date().toLocaleDateString()}`,
            user_agent: navigator.userAgent
        })
      });

      if (!res.ok) throw new Error('Invalid PIN');
      const data = await res.json();
      const user = data.staff;
      const restaurant = data.restaurant;

      // Store restaurant info
      if (restaurant) {
        localStorage.setItem('currentRestaurant', JSON.stringify(restaurant));
        localStorage.setItem('restaurant_id', restaurant.id);

      }

      // ✅ Phase 2b: Store JWT tokens if present
      if (data.tokens) {
        sessionStorage.setItem('accessToken', data.tokens.access_token);
        sessionStorage.setItem('refreshToken', data.tokens.refresh_token);
        const expiryTime = Date.now() + (data.tokens.expires_in * 1000);
        sessionStorage.setItem('accessTokenExpiry', expiryTime.toString());

      }

      localStorage.setItem('saved_pin', pin);
      setCurrentUser(user);
      if (user.role === 'SUPER_ADMIN') {
        setActiveView('SUPER_ADMIN');
      } else if (user.role === 'SERVER' || user.role === 'WAITER') {
        setActiveView('ORDER_HUB');
      } else if (user.role === 'CASHIER') {
        setActiveView('POS');
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
    setActiveView('LOGIN');
    localStorage.removeItem('saved_pin');
  };

  // Validate token on app load and restore session
  useEffect(() => {
    const validateToken = async () => {
      const token = sessionStorage.getItem('accessToken');
      const expiry = sessionStorage.getItem('accessTokenExpiry');
      
      if (token && expiry) {
        if (Date.now() > parseInt(expiry)) {
          console.log('[Auth] Token expired on app load');
          logout();
        } else {
          try {
            // Restore session using token
            const res = await fetchWithAuth(`${API_URL}/auth/me`);
            if (res.ok) {
              const data = await res.json();
              setCurrentUser(data.staff);
              if (data.restaurant) {
                localStorage.setItem('currentRestaurant', JSON.stringify(data.restaurant));
                localStorage.setItem('restaurant_id', data.restaurant.id);
              }
              
              // Set initial view based on role
              const user = data.staff;
              if (user.role === 'SUPER_ADMIN') setActiveView('SUPER_ADMIN');
              else if (user.role === 'SERVER' || user.role === 'WAITER') setActiveView('ORDER_HUB');
              else if (user.role === 'CASHIER') setActiveView('POS');
              else setActiveView('DASHBOARD');

              fetchInitialData(data.staff);

            }
          } catch (err) {
            console.error('[Auth] Token validation error:', err);
          }
        }
      }
    };
    
    validateToken();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    socketIO.connect();

    // 🔑 Join the restaurant room if user is logged in
    if (currentUser?.restaurant_id) {
      socketIO.emit('join', { room: `restaurant:${currentUser.restaurant_id}` });
    }

    // Real-time DB listeners
    socketIO.on('db_change', (payload: any) => {
      if (process.env.NODE_ENV === 'development') console.log("Real-time DB Change:", payload);
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
    const token = sessionStorage.getItem('accessToken');
    
    // Only auto-login with PIN if there is no token (first time or session cleared)
    if (savedPin && !currentUser && !token) {
      login(savedPin);
    }

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
          await fetchWithAuth(`${API_URL}/orders/${draft.id}`, { method: 'DELETE' });
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
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const addNotification = (type: 'success' | 'error' | 'info' | 'warning', message: string, messageCode?: string) => {
    const id = Math.random().toString(36).substring(7);
    const finalMessage = messageCode ? getBilingualMessage(messageCode) : message;
    setNotifications(prev => [...prev, { id, type, message: finalMessage }]);
    setTimeout(() => removeNotification(id), type === 'error' ? 5000 : 3000);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const calculateOrderTotal = (items: OrderItem[], type: OrderType, _guests: number, fee?: number): PaymentBreakdown => {
    const cfg = operationsConfig || JSON.parse(localStorage.getItem(`fireflow_operations_config_${currentUser?.restaurant_id}`) || '{}');
    const billConfig = getDefaultBillConfig(type, cfg);
    
    // Use provided fee override, otherwise use the one from config
    if (fee !== undefined && fee >= 0 && type === 'DELIVERY') {
      billConfig.deliveryFee = fee;
    } else if (type === 'DELIVERY') {
      billConfig.deliveryFee = Number(cfg.defaultDeliveryFee ?? cfg.default_delivery_fee ?? 0);
    }

    return calculateBill(items, billConfig);
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

      const res = await fetchWithAuth(`${API_URL}/floor/seat-party`, {
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
      activeSession, setActiveSession,
      setActiveView, setOrderToEdit, addNotification, removeNotification,
      login, logout, fetchInitialData,
      calculateOrderTotal, seatGuests, operationsConfig,
      updateTableStatus: async (id: string, status: TableStatus) => {
        const restaurant_id = currentUser?.restaurant_id || localStorage.getItem('restaurant_id');
        await tableService.updateTable(id, { status, restaurant_id: restaurant_id as string });
        await fetchInitialData();
        return true;
      },
      addOrder: async (order: any) => {
        const restaurant_id = currentUser?.restaurant_id || localStorage.getItem('restaurant_id');
        const res = await fetchWithAuth(`${API_URL}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...order, restaurant_id })
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: 'Order creation failed' }));
          throw new Error(errBody.error || 'Order creation failed');
        }
        const result = await res.json();
        await fetchInitialData();
        return result;
      },
      updateOrder: async (order: any) => {
        const restaurant_id = currentUser?.restaurant_id || localStorage.getItem('restaurant_id');
        const res = await fetchWithAuth(`${API_URL}/orders/${order.id}`, {
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
        await fetchWithAuth(`${API_URL}/orders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        fetchInitialData();
      },
      assignDriverToOrder: async (orderId: string, driverId: string) => {
        await fetchWithAuth(`${API_URL}/orders/${orderId}`, {
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
      addMenuItem: async (item: any) => { await fetchWithAuth(`${API_URL}/menu_items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      updateMenuItem: async (item: any) => {
        const res = await fetchWithAuth(`${API_URL}/menu_items`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, restaurant_id: currentUser?.restaurant_id }) });
        if (!res.ok) console.error('[App] updateMenuItem failed:', await res.text());
        await fetchInitialData();
      },
      deleteMenuItem: async (id: string) => { await fetchWithAuth(`${API_URL}/menu_items?id=${id}`, { method: 'DELETE' }); await fetchInitialData(); },
      toggleItemAvailability: async (id: string) => {
        const item = menuItems.find(i => i.id === id);
        if (item) {
          await fetchWithAuth(`${API_URL}/menu_items`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, restaurant_id: currentUser?.restaurant_id, is_available: !item.is_available }) });
          await fetchInitialData();
        }
      },
      addMenuCategory: async (cat: any) => { await fetchWithAuth(`${API_URL}/menu_categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cat, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      updateMenuCategory: async (cat: any) => { await fetchWithAuth(`${API_URL}/menu_categories`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cat, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      deleteMenuCategory: async (id: string) => { await fetchWithAuth(`${API_URL}/menu_categories?id=${id}`, { method: 'DELETE' }); await fetchInitialData(); },
      addSection: async (sec: any) => { await fetchWithAuth(`${API_URL}/sections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sec, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      updateSection: async (sec: any) => { await fetchWithAuth(`${API_URL}/sections`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sec, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      deleteSection: async (id: string) => { await fetchWithAuth(`${API_URL}/sections?id=${id}`, { method: 'DELETE' }); await fetchInitialData(); },
      addTable: async (tbl: any) => { await fetchWithAuth(`${API_URL}/tables`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...tbl, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      updateTable: async (tbl: any) => { await fetchWithAuth(`${API_URL}/tables`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...tbl, restaurant_id: currentUser?.restaurant_id }) }); await fetchInitialData(); },
      deleteTable: async (id: string) => { await fetchWithAuth(`${API_URL}/tables?id=${id}`, { method: 'DELETE' }); await fetchInitialData(); },
      addVendor: async (v: any) => { await fetchWithAuth(`${API_URL}/vendors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
      addCustomer: async (c: any) => { await fetchWithAuth(`${API_URL}/customers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...c, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
      updateCustomer: async (c: any) => { await fetchWithAuth(`${API_URL}/customers/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...c, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
      deleteCustomer: async (id: string) => { await fetchWithAuth(`${API_URL}/customers/${id}`, { method: 'DELETE' }); fetchInitialData(); },

      // Stations CRUD
      stations,
      addStation: async (s: any) => { await fetchWithAuth(`${API_URL}/stations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
      updateStation: async (s: any) => { await fetchWithAuth(`${API_URL}/stations`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }); fetchInitialData(); },
      deleteStation: async (id: string) => { await fetchWithAuth(`${API_URL}/stations?id=${id}`, { method: 'DELETE' }); fetchInitialData(); },
      cancelOrder: async (id: string, reason: string, notes?: string) => {
        try {
          const res = await fetchWithAuth(`${API_URL}/orders/${id}`, {
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
          const verifyRes = await fetchWithAuth(`${API_URL}/auth/verify-pin`, {
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
          const res = await fetchWithAuth(`${API_URL}/orders/${id}`, {
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
          // Flatten breakdown for API consistency
          const { breakdown } = transaction;
          const payload = {
            ...transaction,
            tax: breakdown?.tax,
            service_charge: breakdown?.serviceCharge,
            discount: breakdown?.discount,
            delivery_fee: breakdown?.deliveryFee,
            restaurant_id: currentUser?.restaurant_id,
            staff_id: currentUser?.id
          };

          const res = await fetchWithAuth(`${API_URL}/orders/${orderId}/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
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
      completeDelivery: async (orderId: string) => {
        try {
          const res = await fetchWithAuth(`${API_URL}/orders/${orderId}/mark-delivered`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ processedBy: currentUser?.id })
          });
          if (!res.ok) throw new Error('Failed to mark as delivered');
          addNotification('success', 'Order marked as delivered');
          fetchInitialData();
        } catch (e: any) {
          addNotification('error', e.message);
        }
      },
      failDelivery: async (orderId: string, reason: string) => {
        try {
          const res = await fetchWithAuth(`${API_URL}/orders/${orderId}/mark-failed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason, processedBy: currentUser?.id })
          });
          if (!res.ok) throw new Error('Failed to mark as failed');
          addNotification('success', 'Order delivery failed (reset to READY)');
          fetchInitialData();
        } catch (e: any) {
          addNotification('error', e.message);
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
  const isMobile = useIsMobile();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [showDevicePairing, setShowDevicePairing] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const [showMobileMenu, setShowMobileMenu] = useState(false);

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

  const getMenuItems = () => {
    if (currentUser.role === 'SUPER_ADMIN') {
      return [{ id: 'SUPER_ADMIN', icon: Shield, label: 'Vault Control' }];
    }

    const allItems = [
      { id: 'DASHBOARD', icon: Layout, label: 'Aura Dash', roles: ['ADMIN', 'MANAGER'] },
      { id: 'ORDER_HUB', icon: Utensils, label: 'Dine-In Hub', roles: ['ADMIN', 'MANAGER', 'SERVER', 'WAITER', 'CASHIER'] },
      { id: 'POS', icon: Grid, label: 'POS Control', roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
      { id: 'KITCHEN', icon: Coffee, label: 'KDS Feed', roles: ['ADMIN', 'MANAGER', 'CHEF'] },
      { id: 'LOGISTICS', icon: Bike, label: 'Logistics Hub', roles: ['ADMIN', 'MANAGER', 'RIDER', 'CASHIER'] },
      { id: 'ACTIVITY', icon: History, label: 'Command Hub', roles: ['ADMIN', 'MANAGER'] },
      { id: 'FINANCE', icon: CreditCard, label: 'Finance', roles: ['ADMIN', 'MANAGER'] },
      { id: 'REGISTER', icon: CreditCard, label: 'Register', roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
      { id: 'SETTINGS', icon: Settings, label: 'System', roles: ['ADMIN', 'MANAGER'] },
    ];

    return allItems.filter(item => 
      !item.roles || item.roles.includes(currentUser.role as any) || currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER'
    ).map(({ roles, ...rest }) => rest);
  };

  const menuItems = getMenuItems();

  // Command palette commands
  const commands = [
    // Navigation
    { id: 'nav-dashboard', label: 'Go to Dashboard', shortcut: 'G D', category: 'Navigation', icon: '📊', roles: ['ADMIN', 'MANAGER'], action: () => setActiveView('DASHBOARD') },
    { id: 'nav-pos', label: 'Go to POS', shortcut: 'G P', category: 'Navigation', icon: '🛒', roles: ['ADMIN', 'MANAGER', 'CASHIER'], action: () => setActiveView('POS') },
    { id: 'nav-kitchen', label: 'Go to Kitchen', shortcut: 'G K', category: 'Navigation', icon: '👨‍🍳', roles: ['ADMIN', 'MANAGER', 'CHEF'], action: () => setActiveView('KITCHEN') },
    { id: 'nav-orders', label: 'Go to Dine-In Hub', shortcut: 'G O', category: 'Navigation', icon: '🍽️', roles: ['ADMIN', 'MANAGER', 'SERVER', 'WAITER', 'CASHIER'], action: () => setActiveView('ORDER_HUB') },
    { id: 'nav-logistics', label: 'Go to Logistics', shortcut: 'G L', category: 'Navigation', icon: '🚚', roles: ['ADMIN', 'MANAGER', 'RIDER', 'CASHIER'], action: () => setActiveView('LOGISTICS') },
    { id: 'nav-billing', label: 'Go to Billing', shortcut: 'G B', category: 'Navigation', icon: '💳', roles: ['ADMIN', 'MANAGER'], action: () => setActiveView('BILLING') },
    { id: 'nav-menu', label: 'Go to Menu', shortcut: 'G M', category: 'Navigation', icon: '☕', roles: ['ADMIN', 'MANAGER'], action: () => setActiveView('MENU') },
    { id: 'nav-settings', label: 'Go to Settings', shortcut: 'G S', category: 'Navigation', icon: '⚙️', roles: ['ADMIN', 'MANAGER'], action: () => setActiveView('SETTINGS') },
    // Actions
    { id: 'action-refresh', label: 'Refresh Data', shortcut: 'Ctrl+R', category: 'Actions', icon: '🔄', action: () => fetchInitialData() },
    { id: 'action-theme', label: 'Toggle Theme', shortcut: 'Ctrl+T', category: 'Actions', icon: '🌙', action: toggleTheme },
    { id: 'action-logout', label: 'Logout', shortcut: 'Ctrl+Q', category: 'Actions', icon: '🚪', action: logout },
  ].filter(cmd => !cmd.roles || cmd.roles.includes(currentUser.role as any) || currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER');



  return (
    <div className="flex h-screen bg-[#020617] text-slate-200 overflow-hidden">
      <aside
        className={`hidden md:flex bg-[#0B0F19] border-r border-slate-800 flex-col flex-shrink-0 z-50 transition-[width] duration-300 ease-in-out ${sidebarExpanded ? 'w-64' : 'w-16'}`}
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
        {/* Mobile Slim Header */}
        {isMobile && activeView !== 'POS' && (
          <header className="bg-[#0B0F19]/95 backdrop-blur-xl border-b border-white/5 px-4 py-2.5 flex items-center justify-between sticky top-0 z-[60]">
            <div className="flex items-center gap-2">
              <div className="bg-gold-500 w-7 h-7 rounded-lg flex items-center justify-center text-black font-black text-[10px]">FF</div>
              <span className="text-xs font-black text-white uppercase tracking-tighter italic">{activeView?.replace('_', ' ')}</span>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 bg-slate-900 rounded-xl"
              >
                <Bell size={16} className="text-slate-400" />
                {notifications.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
              </button>
              
              <div 
                onClick={() => setShowMobileMenu(true)}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center text-[10px] font-black text-gold-500 uppercase"
              >
                {currentUser?.name?.[0]}
              </div>
            </div>
          </header>
        )}

        {/* Global Desktop Header - Redesigned */}
        {!isMobile && activeView !== 'POS' && (
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

        {/* Role Context Bar - Hidden on Mobile and POS to maximize space */}
        {!isMobile && activeView !== 'POS' && (
          <RoleContextBar
            currentUser={currentUser}
            connectionStatus={connectionStatus}
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
                  activeView === 'POS' ? (isMobile ? <POSViewMobile /> : <POSView />) :
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

        {/* Mobile Bottom Navigation Bar */}
        {isMobile && currentUser && (
          <nav className="bg-[#0B0F19]/95 backdrop-blur-2xl border-t border-white/5 px-2 py-3 flex items-center justify-around shrink-0 relative z-[70] pb-6">
            <button 
              onClick={() => setActiveView('DASHBOARD')}
              className={`flex flex-col items-center gap-1.5 transition-all ${activeView === 'DASHBOARD' ? 'text-gold-500 translate-y-[-2px]' : 'text-slate-500'}`}
            >
              <Layout size={20} className={activeView === 'DASHBOARD' ? 'fill-gold-500/20' : ''} />
              <span className="text-[8px] font-black uppercase tracking-widest">Aura Dash</span>
            </button>
            
            <button 
              onClick={() => setActiveView('ORDER_HUB')}
              className={`flex flex-col items-center gap-1.5 transition-all ${activeView === 'ORDER_HUB' ? 'text-gold-500 translate-y-[-2px]' : 'text-slate-500'}`}
            >
              <Utensils size={20} className={activeView === 'ORDER_HUB' ? 'fill-gold-500/20' : ''} />
              <span className="text-[8px] font-black uppercase tracking-widest">Order Hub</span>
            </button>

            <button 
              onClick={() => setActiveView('POS')}
              className={`flex flex-col items-center gap-1 transition-all ${activeView === 'POS' ? 'text-gold-500 translate-y-[-2px]' : 'text-slate-500'}`}
            >
              <div className={`p-2 rounded-2xl ${activeView === 'POS' ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/20 ring-4 ring-gold-500/10' : 'bg-slate-900'}`}>
                <Grid size={22} />
              </div>
            </button>

            <button 
              onClick={() => setActiveView('KITCHEN')}
              className={`flex flex-col items-center gap-1.5 transition-all ${activeView === 'KITCHEN' ? 'text-gold-500 translate-y-[-2px]' : 'text-slate-500'}`}
            >
              <Coffee size={20} className={activeView === 'KITCHEN' ? 'fill-gold-500/20' : ''} />
              <span className="text-[8px] font-black uppercase tracking-widest">KDS Feed</span>
            </button>

            <button 
              onClick={() => setShowMobileMenu(true)}
              className={`flex flex-col items-center gap-1.5 transition-all ${showMobileMenu ? 'text-gold-500' : 'text-slate-500'}`}
            >
              <Menu size={20} />
              <span className="text-[8px] font-black uppercase tracking-widest">More</span>
            </button>
          </nav>
        )}
      </main>

      {/* Mobile Drawer (More Menu) */}
      {isMobile && showMobileMenu && (
        <div className="fixed inset-0 z-[100] animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowMobileMenu(false)} />
          <aside className="absolute inset-y-0 right-0 w-4/5 max-w-sm bg-[#0B0F19] border-l border-white/5 shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
               <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gold-500 uppercase tracking-widest">Active Profile</span>
                  <span className="text-xl font-black text-white uppercase tracking-tighter">{currentUser?.name}</span>
               </div>
               <button onClick={() => setShowMobileMenu(false)} className="p-2 bg-slate-900 rounded-xl text-slate-500">
                 <X size={20} />
               </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
               {menuItems.filter(item => !['DASHBOARD', 'ORDER_HUB', 'POS', 'KITCHEN'].includes(item.id)).map(item => (
                 <button 
                   key={item.id}
                   onClick={() => {
                     setActiveView(item.id);
                     setShowMobileMenu(false);
                   }}
                   className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all ${activeView === item.id ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/20' : 'text-slate-400 hover:bg-slate-900'}`}
                 >
                   <item.icon size={20} />
                   <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
                 </button>
               ))}
            </nav>

            <div className="p-4 border-t border-white/5 space-y-3">
               <button 
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-4 py-4 bg-slate-900 rounded-2xl text-slate-400 active:scale-95 transition-all"
               >
                 <div className="flex items-center gap-4">
                    {theme === 'dark' ? <Moon size={18}/> : <Sun size={18}/>}
                    <span className="text-[10px] font-black uppercase tracking-widest">Visual Mode</span>
                 </div>
                 <span className="text-[8px] font-bold text-gold-500 bg-gold-500/10 px-2 py-0.5 rounded-full uppercase">{theme}</span>
               </button>

               <button 
                onClick={logout}
                className="w-full flex items-center gap-4 px-4 py-4 bg-red-500/10 text-red-500 rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-red-500/5"
               >
                 <LogOut size={18} />
                 <span>Security Logout</span>
               </button>
            </div>
          </aside>
        </div>
      )}

      {/* Global Notifications UI */}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
        {notifications.map(n => (
          <div key={n.id} className={`p-4 rounded-xl shadow-2xl border backdrop-blur-md ${
            n.type === 'error' ? 'bg-red-900/90 border-red-500/50 text-white' : 
            n.type === 'warning' ? 'bg-amber-900/90 border-amber-500/50 text-white' :
            'bg-slate-900/90 border-gold-500/50 text-white'
          } text-xs font-medium whitespace-pre-line animate-in slide-in-from-right duration-300`}>
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