import React, { useState, useEffect, useRef } from 'react';
import { Staff, Order, OrderStatus, Table, Section, MenuItem, MenuCategory, Notification, OrderItem, OrderType, TableStatus, PaymentBreakdown, Customer, Supplier, Station } from '../shared/types';
import { Layout, Grid, LogOut, Settings, Coffee, Bike, CreditCard, Utensils, Shield, RefreshCw, Clock, Bell, Moon, Sun, Menu, X, History, Package, Users, Truck } from 'lucide-react';
import { useIsMobile } from './hooks/useIsMobile';
import { fetchWithAuth, setTargetRestaurant } from '../shared/lib/authInterceptor';
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
import { SuppliersView } from '../operations/suppliers/SuppliersView';
import { MenuView } from '../operations/menu/MenuView';
import { DashboardView } from '../operations/dashboard/DashboardView';
import { TransactionsView } from '../operations/transactions/TransactionsView';
import { StaffView } from '../features/settings/StaffView';
import { SettingsView } from '../features/settings/SettingsView';
import { BillingView } from '../features/restaurant/BillingView';
import FinancialCommandCenter from '../operations/finance/FinancialCommandCenter';
import { RoleContextBar } from './components/RoleContextBar';
import { CommandPalette } from './components/CommandPalette';
import { SessionExpiredView } from '../auth/views/SessionExpiredView';
import { RiderView } from '../operations/logistics/RiderView';
import CashierView from '../pages/CashierView';
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

// --- HELPERS (Global Logic) ---
const formatMenuItem = (m: any) => ({
  ...m,
  price: Number(m.price || 0),
  available: m.is_available ?? m.available ?? true,
  is_available: m.is_available ?? m.available ?? true,
  image_url: m.image_url || m.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80',
  nameUrdu: m.name_urdu,
  name_urdu: m.name_urdu,
  category_rel: m.category_rel
});

const formatOrder = (o: any, tables: Table[] = []) => {
  const dineIn = o.dine_in_order || (o.dine_in_orders && o.dine_in_orders[0]);
  const takeaway = o.takeaway_order || (o.takeaway_orders && o.takeaway_orders[0]);
  const delivery = o.delivery_order || (o.delivery_orders && o.delivery_orders[0]);

  // Find the table object
  const tableObj = Array.isArray(tables) ? tables.find((t: any) => t.id === (dineIn?.table_id || o.table_id)) : null;

  const orderItems = (o.order_items || []).map((item: any) => ({
    ...item,
    unit_price: Number(item.unit_price || 0),
    total_price: Number(item.total_price || (Number(item.unit_price || 0) * (item.quantity || 0))),
    item_name: item.item_name || item.menu_item?.name || item.item_name || "Unknown Item"
  }));

  const total = Number(o.total || 0);
  const tax = Number(o.tax || 0);
  const service_charge = Number(o.service_charge || 0);
  const discount = Number(o.discount || 0);
  const delivery_fee = Number(o.delivery_fee || 0);

  // Ensure breakdown has a valid subtotal
  const breakdown = o.breakdown && typeof o.breakdown === 'object' ? o.breakdown : {
    subtotal: total - tax - service_charge - delivery_fee + discount,
    tax,
    serviceCharge: service_charge,
    discount,
    deliveryFee: delivery_fee,
    grandTotal: total
  };

  return {
    ...o,
    total,
    tax,
    service_charge,
    delivery_fee,
    discount,
    breakdown,
    tableId: dineIn?.table_id || o.table_id || null,
    table: tableObj,
    guestCount: dineIn?.guest_count || o.guest_count || 1,
    customerName: takeaway?.customer_name || delivery?.customer_name || o.customer_name || "Guest",
    customerPhone: takeaway?.customer_phone || delivery?.customer_phone || o.customer_phone || "",
    timestamp: new Date(o.created_at || o.timestamp || Date.now()),
    order_items: orderItems
  };
};

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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
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

  // Ref to track if we've already joined the room
  const hasJoinedRoom = useRef(false);

  // --- REFS FOR STABLE SYNC (Avoid closures with stale state) ---
  const tablesRef = React.useRef(tables);
  const sectionsRef = React.useRef(sections);
  const stationsRef = React.useRef(stations);

  React.useEffect(() => { tablesRef.current = tables; }, [tables]);
  React.useEffect(() => { sectionsRef.current = sections; }, [sections]);
  React.useEffect(() => { stationsRef.current = stations; }, [stations]);

  // ── Open Drawer modal state ─────────────────────────────────────────────
  // Shown when the settle endpoint returns HTTP 402 SESSION_REQUIRED.
  // Stores the exact orderId + payload so the retry uses identical data.
  const [showOpenDrawerModal, setShowOpenDrawerModal] = useState(false);
  const [pendingSettlePayload, setPendingSettlePayload] = useState<{
    orderId: string;
    payload: any;
    resolve: (val: boolean) => void;
    reject: (err: any) => void;
  } | null>(null);
  const [drawerFloat, setDrawerFloat] = useState('0');
  const [drawerSubmitting, setDrawerSubmitting] = useState(false);

  const API_URL = (typeof window !== 'undefined' 
    ? (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : window.location.origin + '/api') 
    : 'http://localhost:3001/api');

  // Helper: Get Authorization header with JWT token
  const getAuthHeaders = () => {
    const accessToken = localStorage.getItem('accessToken');
    const expiry = localStorage.getItem('accessTokenExpiry');
    

    // Check if token is expired
    if (expiry && Date.now() > parseInt(expiry)) {
      console.log('[Auth] Token expired, clearing session');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('accessTokenExpiry');
      return { 'Content-Type': 'application/json' };
    }
    
    return {
      'Content-Type': 'application/json',
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
    };
  };

  const fetchInitialData = async (userOverride?: any, restaurantIdOverride?: string) => {
    const user = userOverride || currentUser;
    if (!user) return;
    
    setLoading(true);
    try {
      // Get restaurant_id: override (for SUPER_ADMIN mode) > user > localStorage
      const restaurantId = restaurantIdOverride ||
                          user.restaurant_id || 
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
        fetchWithAuth(`${API_URL}/suppliers?restaurant_id=${restaurantId}`, { headers }),
        fetchWithAuth(`${API_URL}/stations?restaurant_id=${restaurantId}`, { headers }),
        fetchWithAuth(`${API_URL}/operations/config/${restaurantId}`, { headers })
      ];
      
      const [ordersRes, tablesRes, sectionsRes, menuRes, catRes, staffRes, trxRes, custDataRes, supplierRes, stationRes, configRes] = await Promise.all(fetches);

      const [ordersData, tablesData, sectionsData, menuData, catData, staffData, trxData, custData, supplierData, stationData, configData] = await Promise.all([
        ordersRes.ok ? ordersRes.json() : [],
        tablesRes.ok ? tablesRes.json() : [],
        sectionsRes.ok ? sectionsRes.json() : [],
        menuRes.ok ? menuRes.json() : [],
        catRes.ok ? catRes.json() : [],
        staffRes.ok ? staffRes.json() : [],
        trxRes.ok ? trxRes.json() : [],
        custDataRes.ok ? custDataRes.json() : [],
        supplierRes.ok ? supplierRes.json() : [],
        stationRes.ok ? stationRes.json() : [],
        configRes.ok ? configRes.json() : null
      ]);

      const mappedOrders = (Array.isArray(ordersData) ? ordersData : []).map(o => formatOrder(o, tablesData));
      setOrders(mappedOrders);
      setTables(Array.isArray(tablesData) ? tablesData : []);
      setSections(Array.isArray(sectionsData) ? sectionsData : []);
      setMenuItems(Array.isArray(menuData) ? menuData.map(formatMenuItem) : []);
      setMenuCategories(Array.isArray(catData) ? catData : []);
      setServers(Array.isArray(staffData) ? staffData : []);
      setTransactions(Array.isArray(trxData) ? trxData.map((t: any) => ({ ...t, amount: Number(t.amount) })) : []);
      setDrivers(Array.isArray(staffData) ? staffData.filter((s: any) => s.role === 'RIDER' || s.role === 'DRIVER') : []);
      setCustomers(Array.isArray(custData) ? custData : []);
      setSuppliers(Array.isArray(supplierData) ? supplierData : []);
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

      // ✅ Clear ALL stale session data before applying new session.
      // This prevents a previous manager/admin session from bleeding into a cashier login.
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('accessTokenExpiry');
      localStorage.removeItem('saved_pin');

      // Store restaurant info
      if (restaurant) {
        localStorage.setItem('currentRestaurant', JSON.stringify(restaurant));
        localStorage.setItem('restaurant_id', restaurant.id);
      }

      // Store new JWT tokens
      if (data.tokens) {
        localStorage.setItem('accessToken', data.tokens.access_token);
        localStorage.setItem('refreshToken', data.tokens.refresh_token);
        const expiryTime = Date.now() + (data.tokens.expires_in * 1000);
        localStorage.setItem('accessTokenExpiry', expiryTime.toString());
      }

      localStorage.setItem('saved_pin', pin);
      setCurrentUser(user);

      // Route based on role — CASHIER gets a dedicated full-screen shell
      if (user.role === 'SUPER_ADMIN') {
        setActiveView('SUPER_ADMIN');
      } else if (user.role === 'SERVER' || user.role === 'WAITER') {
        setActiveView('ORDER_HUB');
      } else if (user.role === 'CASHIER') {
        setActiveView('CASHIER_VIEW');
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
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('accessTokenExpiry');

    // Clear app state
    setCurrentUser(null);
    setOrders([]);
    setActiveView('LOGIN');
    localStorage.removeItem('saved_pin');
    hasJoinedRoom.current = false;
  };

  // Validate token on app load and restore session
  useEffect(() => {
    const validateToken = async () => {
      const token = localStorage.getItem('accessToken');
      const expiry = localStorage.getItem('accessTokenExpiry');
      
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
              else if (user.role === 'CASHIER') setActiveView('CASHIER_VIEW');
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

  const handleDbChange = (payload: any) => {
    if (process.env.NODE_ENV === 'development') console.log("Real-time DB Change:", payload);
    const { table, eventType, data, id } = payload;

    if (table === 'orders') {
      console.log(`[SYNC] Handling ${eventType} for table 'orders':`, data?.id || id);
      
      setOrders(prev => {
        if (eventType === 'INSERT' && data) {
          if (prev.some(o => o.id === data.id)) return prev;
          return [...prev, formatOrder(data, tablesRef.current)];
        }
        if (eventType === 'UPDATE' && data) {
          const index = prev.findIndex(o => o.id === data.id);
          if (index === -1) {
            // UPSERT: If laptop missed INSERT, add it now
            return [...prev, formatOrder(data, tablesRef.current)];
          }
          
          // Preserve existing item statuses for items already in COOKING or READY state
          const existingOrder = prev[index];
          const mergedData = { ...data };
          
          if (data.order_items && existingOrder.order_items) {
              mergedData.order_items = data.order_items.map((newItem: any) => {
                  const existingItem = existingOrder.order_items?.find(
                      (ei: any) => ei.id === newItem.id
                  );
                  // If item was already COOKING or READY, preserve that status
                  if (existingItem && 
                      (existingItem.item_status === 'COOKING' || 
                       existingItem.item_status === 'READY')) {
                      return { ...newItem, item_status: existingItem.item_status };
                  }
                  return newItem;
              });
          }
          
          return prev.map((o, i) => 
              i === index ? formatOrder({ ...o, ...mergedData }, tablesRef.current) : o
          );
        }
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
  };

  const handleSessionExpired = () => {
    logout();
    setActiveView('SESSION_EXPIRED');
  };

  useEffect(() => {
    socketIO.connect();
    window.addEventListener('session:expired', handleSessionExpired);

    // Set up db_change listener ONCE — remove previous before adding
    socketIO.removeAllListeners('db_change');
    socketIO.on('db_change', handleDbChange);

    const savedPin = localStorage.getItem('saved_pin');
    const token = localStorage.getItem('accessToken');
    
    // Only auto-login with PIN if there is no token (first time or session cleared)
    if (savedPin && !currentUser && !token) {
      login(savedPin);
    }

    return () => {
      window.removeEventListener('session:expired', handleSessionExpired);
      socketIO.removeAllListeners('db_change');
    };
  }, []); // Run ONCE on mount

  // Separate useEffect ONLY for room joining
  useEffect(() => {
    if (currentUser?.restaurant_id && !hasJoinedRoom.current) {
      console.log(`[SOCKET] Joining room: restaurant:${currentUser.restaurant_id}`);
      socketIO.emit('join', { room: `restaurant:${currentUser.restaurant_id}` });
      hasJoinedRoom.current = true;
    }
  }, [currentUser?.restaurant_id]); // Only re-run when restaurant_id changes

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
        setOrders(prev => prev.filter(o => !oldDrafts.some(od => od.id === o.id)));
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

  // Opens cashier session then retries the pending settle call with the exact same payload.
  const handleOpenDrawerAndRetry = async () => {
    if (!pendingSettlePayload || drawerSubmitting) return;
    setDrawerSubmitting(true);
    
    // Capture state
    const { orderId, payload, resolve, reject } = pendingSettlePayload;

    try {
      const openRes = await fetchWithAuth(`${API_URL}/cashier/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: currentUser?.restaurant_id,
          staffId: currentUser?.id,
          openingFloat: Number(drawerFloat) || 0
        })
      });
      if (!openRes.ok) {
        const err = await openRes.json();
        throw new Error(err.error || 'Failed to open cashier session');
      }
      const sessionData = await openRes.json();
      setActiveSession(sessionData.session);
      addNotification('success', 'Drawer opened — retrying payment...');

      setShowOpenDrawerModal(false);
      setPendingSettlePayload(null);

      // Retry the exact same settle call
      const retryRes = await fetchWithAuth(`${API_URL}/orders/${orderId}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!retryRes.ok) {
        const err = await retryRes.json();
        throw new Error(err.error || 'Payment failed after session open');
      }
      setOrders(prev => prev.map(o => o.id === orderId ? ({ ...o, status: 'CLOSED' as OrderStatus, payment_status: 'PAID' as any } as Order) : o));
      addNotification('success', 'Payment processed successfully');
      resolve(true);
    } catch (e: any) {
      addNotification('error', e.message);
      reject(e);
      setShowOpenDrawerModal(false);
      setPendingSettlePayload(null);
    } finally {
      setDrawerSubmitting(false);
    }
  };

  return (
    <AppContext.Provider value={{
      currentUser, orders, drivers, tables, sections, servers, transactions, expenses, reservations, menuItems, menuCategories, customers, suppliers, stations,
      connectionStatus, lastSyncAt, notifications, activeView, loading, isRestaurantLoading, orderToEdit,
      socket: socketIO,
      activeSession, setActiveSession,
      setActiveView, setOrderToEdit, addNotification, removeNotification,
      login, logout, fetchInitialData,
      calculateOrderTotal, seatGuests, operationsConfig,
      updateTableStatus: async (id: string, status: TableStatus) => {
        const restaurant_id = currentUser?.restaurant_id || localStorage.getItem('restaurant_id');
        await tableService.updateTable(id, { status, restaurant_id: restaurant_id as string });
        setTables(prev => prev.map(t => t.id === id ? { ...t, status } : t));
        return true;
      },
      addOrder: async (order: any) => {
        const restaurant_id = currentUser?.restaurant_id || localStorage.getItem('restaurant_id');
        const res = await fetchWithAuth(`${API_URL}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...order, restaurant_id })
        });
        if (!res.ok) throw new Error('Order creation failed');
        const result = await res.json();
        setOrders(prev => [...prev, formatOrder(result, tables)]);
        return result;
      },
      updateOrder: async (order: any) => {
        const res = await fetchWithAuth(`${API_URL}/orders/${order.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...order, restaurant_id: currentUser?.restaurant_id })
        });
        if (!res.ok) return null;
        const result = await res.json();
        setOrders(prev => prev.map(o => o.id === result.id ? formatOrder(result, tables) : o));
        return result;
      },
      fireOrder: async (id: string, type: string) => {
        const res = await fetchWithAuth(`${API_URL}/orders/${id}/fire`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type })
        });
        if (!res.ok) return null;
        const result = await res.json();
        const updatedOrder = result.order;
        if (updatedOrder) {
          setOrders(prev => prev.map(o => o.id === updatedOrder.id ? formatOrder(updatedOrder, tables) : o));
        }
        return updatedOrder;
      },
      updateOrderStatus: async (id: string, status: OrderStatus) => {
        const res = await fetchWithAuth(`${API_URL}/orders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        if (res.ok) {
          const result = await res.json();
          setOrders(prev => prev.map(o => o.id === id ? formatOrder(result, tables) : o));
        }
      },
      assignDriverToOrder: async (orderId: string, driverId: string) => {
        const res = await fetchWithAuth(`${API_URL}/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'READY', assigned_driver_id: driverId, dispatched_at: new Date() })
        });
        if (res.ok) {
          setOrders(prev => prev.map(o => o.id === orderId ? ({ ...o, status: 'READY' as OrderStatus, assigned_driver_id: driverId, dispatched_at: new Date() } as Order) : o));
        }
      },
      addMenuItem: async (item: any) => { 
        const res = await fetchWithAuth(`${API_URL}/menu_items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setMenuItems(prev => [...prev, formatMenuItem(result)]); }
      },
      updateMenuItem: async (item: any) => {
        const res = await fetchWithAuth(`${API_URL}/menu_items`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, restaurant_id: currentUser?.restaurant_id }) });
        if (res.ok) { const result = await res.json(); setMenuItems(prev => prev.map(i => i.id === result.id ? formatMenuItem(result) : i)); }
      },
      deleteMenuItem: async (id: string) => { 
        const res = await fetchWithAuth(`${API_URL}/menu_items?id=${id}`, { method: 'DELETE' }); 
        if (res.ok) setMenuItems(prev => prev.filter(i => i.id !== id));
      },
      toggleItemAvailability: async (id: string) => {
        const item = menuItems.find(i => i.id === id);
        if (item) {
          const res = await fetchWithAuth(`${API_URL}/menu_items`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, restaurant_id: currentUser?.restaurant_id, is_available: !item.is_available }) });
          if (res.ok) setMenuItems(prev => prev.map(i => i.id === id ? { ...i, is_available: !i.is_available } : i));
        }
      },
      addMenuCategory: async (cat: any) => { 
        const res = await fetchWithAuth(`${API_URL}/menu_categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cat, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setMenuCategories(prev => [...prev, result]); }
      },
      updateMenuCategory: async (cat: any) => { 
        const res = await fetchWithAuth(`${API_URL}/menu_categories`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cat, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setMenuCategories(prev => prev.map(c => c.id === result.id ? result : c)); }
      },
      deleteMenuCategory: async (id: string) => { 
        const res = await fetchWithAuth(`${API_URL}/menu_categories?id=${id}`, { method: 'DELETE' }); 
        if (res.ok) setMenuCategories(prev => prev.filter(c => c.id !== id));
      },
      addSection: async (sec: any) => { 
        const res = await fetchWithAuth(`${API_URL}/sections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sec, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setSections(prev => [...prev, result]); }
      },
      updateSection: async (sec: any) => { 
        const res = await fetchWithAuth(`${API_URL}/sections`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sec, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setSections(prev => prev.map(s => s.id === result.id ? result : s)); }
      },
      deleteSection: async (id: string) => { 
        const res = await fetchWithAuth(`${API_URL}/sections?id=${id}`, { method: 'DELETE' }); 
        if (res.ok) setSections(prev => prev.filter(s => s.id !== id));
      },
      addTable: async (tbl: any) => { 
        const res = await fetchWithAuth(`${API_URL}/tables`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...tbl, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setTables(prev => [...prev, result]); }
      },
      updateTable: async (tbl: any) => { 
        const res = await fetchWithAuth(`${API_URL}/tables`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...tbl, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setTables(prev => prev.map(t => t.id === result.id ? result : t)); }
      },
      deleteTable: async (id: string) => { 
        const res = await fetchWithAuth(`${API_URL}/tables?id=${id}`, { method: 'DELETE' }); 
        if (res.ok) setTables(prev => prev.filter(t => t.id !== id));
      },
      addSupplier: async (s: any) => { 
        const res = await fetchWithAuth(`${API_URL}/suppliers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setSuppliers(prev => [...prev, result]); }
      },
      updateSupplier: async (s: any) => { 
        const res = await fetchWithAuth(`${API_URL}/suppliers/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setSuppliers(prev => prev.map(item => item.id === result.id ? result : item)); }
      },
      deleteSupplier: async (id: string) => { 
        const res = await fetchWithAuth(`${API_URL}/suppliers/${id}`, { method: 'DELETE' }); 
        if (res.ok) setSuppliers(prev => prev.filter(s => s.id !== id));
      },
      addVendor: async (v: any) => { 
        const res = await fetchWithAuth(`${API_URL}/suppliers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setSuppliers(prev => [...prev, result]); }
      },
      updateVendor: async (v: any) => { 
        const res = await fetchWithAuth(`${API_URL}/suppliers/${v.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setSuppliers(prev => prev.map(item => item.id === result.id ? result : item)); }
      },
      deleteVendor: async (id: string) => { 
        const res = await fetchWithAuth(`${API_URL}/suppliers/${id}`, { method: 'DELETE' }); 
        if (res.ok) setSuppliers(prev => prev.filter(s => s.id !== id));
      },
      addCustomer: async (c: any) => { 
        const res = await fetchWithAuth(`${API_URL}/customers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...c, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setCustomers(prev => [...prev, result]); }
      },
      updateCustomer: async (c: any) => { 
        const res = await fetchWithAuth(`${API_URL}/customers/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...c, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setCustomers(prev => prev.map(item => item.id === result.id ? result : item)); }
      },
      deleteCustomer: async (id: string) => { 
        const res = await fetchWithAuth(`${API_URL}/customers/${id}`, { method: 'DELETE' }); 
        if (res.ok) setCustomers(prev => prev.filter(c => c.id !== id));
      },
      addStation: async (s: any) => { 
        const res = await fetchWithAuth(`${API_URL}/stations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, restaurant_id: currentUser?.restaurant_id }) }); 
        if (res.ok) { const result = await res.json(); setStations(prev => [...prev, result]); }
      },
      updateStation: async (s: any) => { 
        const res = await fetchWithAuth(`${API_URL}/stations`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }); 
        if (res.ok) { const result = await res.json(); setStations(prev => prev.map(item => item.id === result.id ? result : item)); }
      },
      deleteStation: async (id: string) => { 
        const res = await fetchWithAuth(`${API_URL}/stations?id=${id}`, { method: 'DELETE' }); 
        if (res.ok) setStations(prev => prev.filter(s => s.id !== id));
      },
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
          setOrders(prev => prev.map(o => o.id === id ? ({ ...o, status: 'CANCELLED' as OrderStatus } as Order) : o));
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
          setOrders(prev => prev.map(o => o.id === id ? ({ ...o, status: 'VOIDED' as OrderStatus } as Order) : o));
          addNotification('success', 'Order voided successfully');
          return true;
        } catch (e: any) {
          addNotification('error', e.message);
          return false;
        }
      },
      processPayment: async (orderId: string, transaction: any) => {
        try {
          // Extract breakdown and flags for API consistency
          const breakdown = transaction.breakdown || {};
          const payload = {
            ...transaction,
            tax: transaction.tax ?? breakdown?.tax,
            service_charge: transaction.service_charge ?? breakdown?.serviceCharge,
            discount: transaction.discount ?? breakdown?.discount,
            delivery_fee: transaction.delivery_fee ?? breakdown?.deliveryFee,
            // Include flags
            tax_enabled: transaction.tax_enabled ?? breakdown?.tax_enabled,
            service_charge_enabled: transaction.service_charge_enabled ?? breakdown?.service_charge_enabled,
            delivery_fee_enabled: transaction.delivery_fee_enabled ?? breakdown?.delivery_fee_enabled,
            tax_type: transaction.tax_type ?? breakdown?.tax_type,
            restaurant_id: currentUser?.restaurant_id,
            staff_id: currentUser?.id
          };

          const res = await fetchWithAuth(`${API_URL}/orders/${orderId}/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          // 🔒 SESSION GATE: backend returned 402 — no active cashier session.
          // Save the pending payload and show the Open Drawer modal.
          // The retry (handleOpenDrawerAndRetry) sends the exact same payload.
          if (res.status === 402) {
            const err = await res.json();
            if (err.error === 'SESSION_REQUIRED') {
              return new Promise<boolean>((resolve, reject) => {
                setPendingSettlePayload({ orderId, payload, resolve, reject });
                setDrawerFloat('0');
                setShowOpenDrawerModal(true);
              });
            }
          }

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Payment processing failed');
          }
          setOrders(prev => prev.map(o => o.id === orderId ? ({ ...o, status: 'CLOSED' as OrderStatus, payment_status: 'PAID' as any } as Order) : o));
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
          setOrders(prev => prev.map(o => o.id === orderId ? ({ ...o, status: 'DELIVERED' as OrderStatus } as Order) : o));
          addNotification('success', 'Order marked as delivered');
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
          setOrders(prev => prev.map(o => o.id === orderId ? ({ ...o, status: 'READY' as OrderStatus } as Order) : o));
          addNotification('success', 'Order delivery failed (reset to READY)');
        } catch (e: any) {
          addNotification('error', e.message);
        }
      },

    } as any}>
      {children}

      {/* ─── Open Drawer Modal ──────────────────────────────────────────────
           Triggered when POST /api/orders/:id/settle returns 402 SESSION_REQUIRED.
           Opens a cashier session then auto-retries the exact same payment payload.
      ──────────────────────────────────────────────────────────────────── */}
      {showOpenDrawerModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Backdrop */}
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
            onClick={() => { 
                if (!drawerSubmitting) { 
                    if (pendingSettlePayload?.resolve) pendingSettlePayload.resolve(false);
                    setShowOpenDrawerModal(false); 
                    setPendingSettlePayload(null); 
                } 
            }}
          />
          {/* Panel */}
          <div style={{
            position: 'relative', background: '#0B0F19',
            border: '1px solid rgba(251,191,36,0.25)', borderRadius: '18px',
            padding: '32px', width: '100%', maxWidth: '430px',
            boxShadow: '0 30px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div style={{
                width: '46px', height: '46px', borderRadius: '12px', flexShrink: 0,
                background: 'linear-gradient(135deg,rgba(251,191,36,0.2),rgba(251,191,36,0.05))',
                border: '1px solid rgba(251,191,36,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
              }}>🗝️</div>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>Open Your Drawer</h2>
                <p style={{ margin: 0, fontSize: '10px', color: '#fbbf24', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Session Required to Process Payment</p>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '24px', lineHeight: 1.65, borderLeft: '2px solid rgba(251,191,36,0.3)', paddingLeft: '12px' }}>
              A cashier session must be active before payments can be posted to the General Ledger.
              Enter your opening float below — your drawer will be opened and the payment will be processed automatically.
            </p>
            {/* Float input */}
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Opening Float</label>
            <div style={{
              display: 'flex', alignItems: 'center',
              background: '#020617', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', overflow: 'hidden', marginBottom: '24px'
            }}>
              <span style={{ padding: '0 14px', color: '#475569', fontSize: '14px', fontWeight: 700, borderRight: '1px solid rgba(255,255,255,0.06)' }}>Rs.</span>
              <input
                id="drawer-float-input"
                type="number"
                min="0"
                step="1"
                value={drawerFloat}
                onChange={e => setDrawerFloat(e.target.value)}
                onFocus={e => { if (e.target.value === '0') setDrawerFloat(''); }}
                autoFocus
                disabled={drawerSubmitting}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: '#fff', fontSize: '22px', fontWeight: 700,
                  padding: '13px 16px', fontFamily: 'monospace'
                }}
                placeholder="0"
              />
            </div>
            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                id="drawer-cancel-btn"
                onClick={() => { 
                    if (pendingSettlePayload?.resolve) pendingSettlePayload.resolve(false);
                    setShowOpenDrawerModal(false); 
                    setPendingSettlePayload(null); 
                }}
                disabled={drawerSubmitting}
                style={{
                  flex: 1, padding: '13px', borderRadius: '10px',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#64748b', fontSize: '13px', fontWeight: 700,
                  cursor: drawerSubmitting ? 'not-allowed' : 'pointer'
                }}
              >Cancel</button>
              <button
                id="drawer-open-btn"
                onClick={handleOpenDrawerAndRetry}
                disabled={drawerSubmitting}
                style={{
                  flex: 2, padding: '13px', borderRadius: '10px',
                  background: drawerSubmitting ? '#1e293b' : 'linear-gradient(135deg,#fbbf24,#f59e0b)',
                  border: 'none', color: '#000',
                  fontSize: '13px', fontWeight: 800,
                  cursor: drawerSubmitting ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.02em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px'
                }}
              >
                {drawerSubmitting ? (
                  <><span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> Opening...</>
                ) : (
                  <>🗂️ Open Drawer &amp; Process Payment</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
};

// --- 3. THE UI CONTENT WRAPPER ---
const AppContent = () => {
  const { currentUser, activeView, setActiveView, login, logout, notifications, fetchInitialData, loading, orders, tables, connectionStatus } = useAppContext();
  const isMobile = useIsMobile();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // SUPER_ADMIN restaurant mode: stores the restaurant being managed locally in the UI
  const [superAdminRestaurantId, setSuperAdminRestaurantId] = useState<string | null>(null);
  const [superAdminRestaurantName, setSuperAdminRestaurantName] = useState<string | null>(null);

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

  if (activeView === 'SESSION_EXPIRED') {
    return <SessionExpiredView onBackToLogin={() => setActiveView('LOGIN')} />;
  }

  if (!currentUser) return <LoginView onLogin={login} />;
  
  // Cashier full-screen takeover
  if (activeView === 'CASHIER_VIEW') return <CashierView />;

  // SUPER_ADMIN handlers
  const handleEnterRestaurant = (restaurantId: string, restaurantName: string) => {
    setSuperAdminRestaurantId(restaurantId);
    setSuperAdminRestaurantName(restaurantName);
    setTargetRestaurant(restaurantId); // Make fetchWithAuth include x-target-restaurant
    setTimeout(() => {
      fetchInitialData(currentUser, restaurantId);
    }, 50);
    setActiveView('DASHBOARD');
  };

  const handleExitToHQ = () => {
    setSuperAdminRestaurantId(null);
    setSuperAdminRestaurantName(null);
    setTargetRestaurant(null); // Clear header
    setActiveView('SUPER_ADMIN');
  };

  const getMenuItems = () => {
    if (currentUser.role === 'SUPER_ADMIN' && !superAdminRestaurantId) {
      return [{ id: 'SUPER_ADMIN', icon: Shield, label: 'Vault Control' }];
    }
    if (currentUser.role === 'SUPER_ADMIN' && superAdminRestaurantId) {
      // In restaurant mode: show full menu + HQ exit button
      return [
        { id: 'SUPER_ADMIN', icon: Shield, label: '← Back to HQ' },
        { id: 'DASHBOARD', icon: Layout, label: 'Dashboard' },
        { id: 'POS', icon: Grid, label: 'POS Control' },
        { id: 'ORDER_HUB', icon: Utensils, label: 'Dine-In Hub' },
        { id: 'ACTIVITY', icon: History, label: 'Command Hub' },
        { id: 'FINANCE', icon: CreditCard, label: 'Finance' },
        { id: 'SETTINGS', icon: Settings, label: 'Settings' },
      ];
    }

    const allItems = [
      { id: 'DASHBOARD', icon: Layout, label: 'Aura Dash', roles: ['ADMIN', 'MANAGER'] },
      { id: 'ORDER_HUB', icon: Utensils, label: 'Dine-In Hub', roles: ['ADMIN', 'MANAGER', 'SERVER', 'WAITER', 'CASHIER'] },
      { id: 'POS', icon: Grid, label: 'POS Control', roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
      { id: 'KITCHEN', icon: Coffee, label: 'KDS Feed', roles: ['ADMIN', 'MANAGER', 'CHEF'] },
      { id: 'LOGISTICS', icon: Package, label: 'Logistics Hub', roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
      { id: 'RIDER_VIEW', icon: Bike, label: 'Rider Portal', roles: ['RIDER'] },
      { id: 'ACTIVITY', icon: History, label: 'Command Hub', roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
      { id: 'FINANCE', icon: CreditCard, label: 'Finance', roles: ['ADMIN', 'MANAGER'] },
      { id: 'REGISTER', icon: CreditCard, label: 'Register', roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
      { id: 'CUSTOMERS', icon: Users, label: 'Patrons', roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
      { id: 'SUPPLIERS', icon: Truck, label: 'Suppliers', roles: ['ADMIN', 'MANAGER'] },
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
    { id: 'nav-logistics', label: 'Go to Logistics', shortcut: 'G L', category: 'Navigation', icon: '🚚', roles: ['ADMIN', 'MANAGER', 'CASHIER'], action: () => setActiveView('LOGISTICS') },
    { id: 'nav-rider-view', label: 'Go to Rider Portal', shortcut: 'G R', category: 'Navigation', icon: '🏍️', roles: ['RIDER'], action: () => setActiveView('RIDER_VIEW') },
    { id: 'nav-activity', label: 'Go to Command Hub', shortcut: 'G A', category: 'Navigation', icon: '⚡', roles: ['ADMIN', 'MANAGER', 'SERVER', 'CASHIER'], action: () => setActiveView('ACTIVITY') },
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
              onClick={() => {
                // SUPER_ADMIN: '← Back to HQ' exits restaurant mode
                if (currentUser?.role === 'SUPER_ADMIN' && item.id === 'SUPER_ADMIN' && superAdminRestaurantId) {
                  handleExitToHQ();
                } else {
                  setActiveView(item.id);
                }
              }}
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

            {/* CENTER: Restaurant Mode Banner or Connection Status */}
            {currentUser?.role === 'SUPER_ADMIN' && superAdminRestaurantId ? (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gold-500/10 rounded-lg border border-gold-500/30 cursor-pointer hover:bg-gold-500/20 transition-all" onClick={handleExitToHQ}>
                <Shield size={12} className="text-gold-500" />
                <span className="text-[10px] text-gold-500 font-black uppercase tracking-widest">Managing: {superAdminRestaurantName}</span>
                <span className="text-[9px] text-gold-500/60 font-bold">← Exit</span>
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-slate-900/50 rounded-lg border border-slate-700/50">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Live</span>
              </div>
            )}

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
          {activeView === 'SUPER_ADMIN' ? <SuperAdminView onEnterRestaurant={handleEnterRestaurant} /> :
            activeView === 'ORDER_HUB' ? <OrderCommandHub /> :
              activeView === 'MENU' ? <MenuView /> :
                activeView === 'DASHBOARD' ? <DashboardView /> :
                  activeView === 'POS' ? (isMobile ? <POSViewMobile /> : <POSView />) :
                    activeView === 'KITCHEN' ? <KDSView /> :
                      activeView === 'RIDER_VIEW' ? <RiderView /> :
                        activeView === 'LOGISTICS' ? <LogisticsHub /> :
                        activeView === 'ACTIVITY' ? <ActivityLog /> :
                          activeView === 'REGISTER' ? <TransactionsView /> :
                            activeView === 'BILLING' ? <BillingView /> :
                              activeView === 'FINANCE' ? <FinancialCommandCenter /> :
                                activeView === 'STAFF' ? <StaffView /> :
                                  activeView === 'CUSTOMERS' ? <CustomersView /> :
                                    activeView === 'SUPPLIERS' ? <SuppliersView /> :
                                      activeView === 'SETTINGS' ? <SettingsView /> :
                                      <div className="p-20 text-slate-700 font-black uppercase tracking-[0.3em]">SECURE SECTOR NOT SELECTED</div>}
        </div>

        {/* Mobile Bottom Navigation Bar */}
        {isMobile && currentUser && (
          <nav className="bg-[#0B0F19]/95 backdrop-blur-2xl border-t border-white/5 px-2 py-3 flex items-center justify-around shrink-0 relative z-[70] pb-6">
            {menuItems.slice(0, 4).map((item) => (
              <button 
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`flex flex-col items-center gap-1.5 transition-all ${activeView === item.id ? 'text-gold-500 translate-y-[-2px]' : 'text-slate-500'}`}
              >
                {item.id === 'POS' ? (
                  <div className={`p-2 rounded-2xl ${activeView === 'POS' ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/20 ring-4 ring-gold-500/10' : 'bg-slate-900'}`}>
                    <item.icon size={22} />
                  </div>
                ) : (
                  <>
                    <item.icon size={20} className={activeView === item.id ? 'fill-gold-500/20' : ''} />
                    <span className="text-[8px] font-black uppercase tracking-widest">{item.label}</span>
                  </>
                )}
              </button>
            ))}
            
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