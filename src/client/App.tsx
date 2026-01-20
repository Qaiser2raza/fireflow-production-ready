import React, { createContext, useContext, useState, useEffect } from 'react';
import { Staff, Order, Table, Section, MenuItem, MenuCategory, AppContextType, Notification, OrderItem, OrderType, OrderStatus, TableStatus, PaymentBreakdown } from '../shared/types';
import { Layout, Grid, LogOut, Settings, Users, Coffee, Bike, ShoppingBag, CreditCard, Utensils, Shield, RefreshCw } from 'lucide-react';


// --- COMPONENT IMPORTS ---
import { OrderCommandHub } from '../operations/dashboard/OrderCommandHub';
import { MenuView } from '../operations/menu/MenuView';
import { DashboardView } from '../operations/dashboard/DashboardView';
import { POSView } from '../operations/pos/POSView';
import { KDSView } from '../operations/kds/KDSView';
import { LogisticsHub } from '../operations/logistics/LogisticsHub';
import { ActivityLog } from '../operations/activity/ActivityLog';
import { TransactionsView } from '../operations/transactions/TransactionsView';
import { StaffView } from '../features/settings/StaffView';
import { SuperAdminView } from '../features/saas-hq/SuperAdminView';
import { SettingsView } from '../features/settings/SettingsView';
import { LoginView } from '../auth/views/LoginView';
import { DevicePairingVerificationView } from '../auth/views/DevicePairingVerificationView';

// Services
import { socketIO } from '../shared/lib/socketClient';

// --- 1. CONTEXT DEFINITION ---
const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};

// --- Ralf's Secure Storage Wrapper ---
const secureStore = {
  get: (key: string) => (window as any).electron?.store?.get(key) || localStorage.getItem(key),
  set: (key: string, val: any) => {
    if ((window as any).electron?.store) {
      (window as any).electron.store.set(key, val);
    }
    // Still keep in localStorage for web-only testing if needed, but in production
    // we should rely exclusively on the encrypted electron-store.
    localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
  },
  delete: (key: string) => {
    (window as any).electron?.store?.delete(key);
    localStorage.removeItem(key);
  }
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
  const [expenses] = useState<any[]>([]);
  const [reservations] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<Staff[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(secureStore.get('access_token'));
  const [refreshToken, setRefreshToken] = useState<string | null>(secureStore.get('refresh_token'));

  const [activeView, setActiveView] = useState('SUPER_ADMIN');
  const [orderToEdit, setOrderToEdit] = useState<Order | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [isRestaurantLoading, setIsRestaurantLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('connected');
  const [lastSyncAt, setLastSyncAt] = useState<Date>(new Date());
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const API_URL = 'http://localhost:3001/api';
  const SERVICE_CHARGE_RATE = 0.10;
  const SERVICE_CHARGE_ENABLED = true;
  const TAX_RATE = 0.00;
  const TAX_ENABLED = false;
  const DEFAULT_DELIVERY_FEE = 250;

  // --- Ralf's Secure Fetch Wrapper ---
  const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers);
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let response = await fetch(url, { ...options, headers });

    // Handle token expiration (410 Gone)
    if (response.status === 410) {
      console.warn('Access token expired, attempting refresh...');
      const refreshed = await handleRefresh();
      if (refreshed) {
        // Retry with new token
        const newHeaders = {
          ...headers,
          'Authorization': `Bearer ${secureStore.get('access_token')}`
        };
        response = await fetch(url, { ...options, headers: newHeaders });
      } else {
        logout();
        throw new Error('Session expired. Please log in again.');
      }
    }

    return response;
  };

  const handleRefresh = async (): Promise<boolean> => {
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (!res.ok) return false;
      const data = await res.json();
      setAccessToken(data.access_token);
      setRefreshToken(data.refresh_token);
      secureStore.set('access_token', data.access_token);
      secureStore.set('refresh_token', data.refresh_token);
      return true;
    } catch (err) {
      return false;
    }
  };

  const fetchInitialData = async (userOverride?: any) => {
    const user = userOverride || currentUser;
    if (!user) return;
    setLoading(true);
    try {
      const restaurantId = user.restaurant_id;
      const [ordersRes, tablesRes, sectionsRes, menuRes, catRes, staffRes, trxRes, custDataRes, vendDataRes] = await Promise.all([
        authFetch(`${API_URL}/orders?restaurant_id=${restaurantId}`),
        authFetch(`${API_URL}/tables?restaurant_id=${restaurantId}`),
        authFetch(`${API_URL}/sections?restaurant_id=${restaurantId}`),
        authFetch(`${API_URL}/menu_items?restaurant_id=${restaurantId}`),
        authFetch(`${API_URL}/menu_categories?restaurant_id=${restaurantId}`),
        authFetch(`${API_URL}/staff?restaurant_id=${restaurantId}`),
        authFetch(`${API_URL}/transactions?restaurant_id=${restaurantId}`),
        authFetch(`${API_URL}/customers?restaurant_id=${restaurantId}`),
        authFetch(`${API_URL}/vendors?restaurant_id=${restaurantId}`)
      ]);

      const [ordersData, tablesData, sectionsData, menuData, catData, staffData, trxData, custData, vendData] = await Promise.all([
        ordersRes.json(), tablesRes.json(), sectionsRes.json(), menuRes.json(), catRes.json(), staffRes.json(), trxRes.json(), custDataRes.json(), vendDataRes.json()
      ]);

      const mappedOrders = (Array.isArray(ordersData) ? ordersData : []).map((o: any) => {
        const dineIn = o.dine_in_order || (o.dine_in_orders && o.dine_in_orders[0]);
        const takeaway = o.takeaway_order || (o.takeaway_orders && o.takeaway_orders[0]);
        const delivery = o.delivery_order || (o.delivery_orders && o.delivery_orders[0]);

        return {
          ...o,
          tableId: dineIn?.table_id || null,
          guestCount: dineIn?.guest_count || 1,
          customerName: takeaway?.customer_name || delivery?.customer_name || "Guest",
          customerPhone: takeaway?.customer_phone || delivery?.customer_phone || "",
          timestamp: new Date(o.created_at)
        };
      });

      setOrders(mappedOrders);
      setTables(Array.isArray(tablesData) ? tablesData : []);
      setSections(Array.isArray(sectionsData) ? sectionsData : []);
      setMenuItems(Array.isArray(menuData) ? menuData.map((m: any) => ({
        ...m,
        available: m.is_available ?? m.available ?? true,
        nameUrdu: m.name_urdu,
        category_rel: m.category_rel
      })) : []);
      setMenuCategories(Array.isArray(catData) ? catData : []);
      setServers(Array.isArray(staffData) ? staffData : []);
      setTransactions(Array.isArray(trxData) ? trxData : []);
      setDrivers(Array.isArray(staffData) ? staffData.filter((s: any) => s.role === 'RIDER' || s.role === 'DRIVER') : []);
      setCustomers(Array.isArray(custData) ? custData : []);
      setVendors(Array.isArray(vendData) ? vendData : []);
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
      const { access_token, refresh_token } = data.tokens;
      setAccessToken(access_token);
      setRefreshToken(refresh_token);

      secureStore.set('access_token', access_token);
      secureStore.set('refresh_token', refresh_token);
      secureStore.set('staff_data', JSON.stringify(user));

      setCurrentUser(user);
      if (user.role === 'SUPER_ADMIN') {
        setActiveView('SUPER_ADMIN');
      } else {
        setActiveView('DASHBOARD');
      }
      // Note: Data sync will happen with the new token
      fetchInitialData(user);
      return true;
    } catch (err) {
      addNotification('error', "Authentication Failed: Invalid PIN");
      secureStore.delete('access_token');
      secureStore.delete('refresh_token');
      secureStore.delete('staff_data');
      return false;
    }
  };

  const logout = async () => {
    // Ralf: Ideally tell backend we are logging out
    try {
      await authFetch(`${API_URL}/auth/logout`, { method: 'POST' });
    } catch (e) {
      console.warn('Logout notification failed', e);
    }

    setCurrentUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setOrders([]);
    setActiveView('DASHBOARD');
    secureStore.delete('access_token');
    secureStore.delete('refresh_token');
    secureStore.delete('staff_data');
  };

  useEffect(() => {
    socketIO.connect();

    // Restore session from storage if tokens exist
    const savedStaff = secureStore.get('staff_data');
    const savedAccessToken = secureStore.get('access_token');

    if (savedStaff && savedAccessToken) {
      try {
        const user = JSON.parse(savedStaff);
        setCurrentUser(user);
        fetchInitialData(user);
      } catch (e) {
        console.error('Failed to restore session:', e);
        logout();
      }
    } else {
      const savedPin = localStorage.getItem('saved_pin');
      if (savedPin && !currentUser) login(savedPin);
    }

    return () => socketIO.disconnect();
  }, []);

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
    const serviceCharge = (type === 'DINE_IN' && SERVICE_CHARGE_ENABLED) ? subtotal * SERVICE_CHARGE_RATE : 0;
    const tax = TAX_ENABLED ? (subtotal + serviceCharge) * TAX_RATE : 0;
    const deliveryFee = type === 'DELIVERY' ? (fee || DEFAULT_DELIVERY_FEE) : 0;
    return { subtotal, serviceCharge, tax, deliveryFee, discount: 0, total: subtotal + serviceCharge + tax + deliveryFee };
  };

  const seatGuests = async (tableId: string, guestCount: number) => {
    try {
      const existingOrder = orders.find(o => (o as any).tableId === tableId && o.status !== OrderStatus.PAID && o.status !== OrderStatus.CANCELLED);
      if (existingOrder) { setOrderToEdit(existingOrder); setActiveView('POS'); return; }
      const res = await authFetch(`${API_URL}/orders/upsert`, {
        method: 'POST',
        body: JSON.stringify({ restaurant_id: currentUser?.restaurant_id, type: 'DINE_IN', status: OrderStatus.NEW, guest_count: guestCount, table_id: tableId, order_items: [] })
      });
      const createdOrder = await res.json();
      await authFetch(`${API_URL}/tables`, {
        method: 'PATCH',
        body: JSON.stringify({ id: tableId, status: TableStatus.OCCUPIED, active_order_id: createdOrder.id, restaurant_id: currentUser?.restaurant_id })
      });
      await fetchInitialData();
      setOrderToEdit(createdOrder);
      setActiveView('POS');
    } catch (err: any) { addNotification('error', err.message); }
  };

  return (
    <AppContext.Provider value={{
      currentUser, orders, drivers, tables, sections, servers, transactions, expenses, reservations, menuItems, menuCategories, customers, vendors,
      connectionStatus, lastSyncAt, notifications, activeView, loading, isRestaurantLoading, orderToEdit,
      socket: socketIO,
      setActiveView, setOrderToEdit, addNotification,
      login, logout, fetchInitialData,
      calculateOrderTotal, seatGuests,
      updateTableStatus: async (id: string, status: TableStatus) => {
        await authFetch(`${API_URL}/tables`, {
          method: 'PATCH',
          body: JSON.stringify({ id, status, restaurant_id: currentUser?.restaurant_id })
        });
        await fetchInitialData();
        return true;
      },
      addOrder: async () => true,
      updateOrder: async (order: any) => { await authFetch(`${API_URL}/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify(order) }); await fetchInitialData(); return true; },
      updateOrderStatus: async () => { },
      addMenuItem: async (item: any) => { await authFetch(`${API_URL}/menu_items`, { method: 'POST', body: JSON.stringify({ ...item, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
      updateMenuItem: async (item: any) => { await authFetch(`${API_URL}/menu_items`, { method: 'PATCH', body: JSON.stringify(item) }); fetchInitialData(); },
      deleteMenuItem: async (id: string) => { await authFetch(`${API_URL}/menu_items?id=${id}`, { method: 'DELETE' }); fetchInitialData(); },
      toggleItemAvailability: async (id: string) => { const item = menuItems.find(i => i.id === id); if (item) { await authFetch(`${API_URL}/menu_items`, { method: 'PATCH', body: JSON.stringify({ id, is_available: !item.is_available }) }); fetchInitialData(); } },
      addMenuCategory: async (cat: any) => { await authFetch(`${API_URL}/menu_categories`, { method: 'POST', body: JSON.stringify({ ...cat, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
      deleteMenuCategory: async (id: string) => { await authFetch(`${API_URL}/menu_categories?id=${id}`, { method: 'DELETE' }); fetchInitialData(); },
      addSection: async (sec: any) => { await authFetch(`${API_URL}/sections`, { method: 'POST', body: JSON.stringify({ ...sec, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
      updateSection: async (sec: any) => { await authFetch(`${API_URL}/sections`, { method: 'PATCH', body: JSON.stringify(sec) }); fetchInitialData(); },
      deleteSection: async (id: string) => { await authFetch(`${API_URL}/sections?id=${id}`, { method: 'DELETE' }); fetchInitialData(); },
      addTable: async (tbl: any) => { await authFetch(`${API_URL}/tables`, { method: 'POST', body: JSON.stringify({ ...tbl, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
      updateTable: async (tbl: any) => { await authFetch(`${API_URL}/tables`, { method: 'PATCH', body: JSON.stringify(tbl) }); fetchInitialData(); },
      deleteTable: async (id: string) => { await authFetch(`${API_URL}/tables?id=${id}`, { method: 'DELETE' }); fetchInitialData(); },
      addVendor: async (v: any) => { await authFetch(`${API_URL}/vendors`, { method: 'POST', body: JSON.stringify({ ...v, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
      addCustomer: async (c: any) => { await authFetch(`${API_URL}/customers`, { method: 'POST', body: JSON.stringify({ ...c, restaurant_id: currentUser?.restaurant_id }) }); fetchInitialData(); },
    } as any}>
      {children}
    </AppContext.Provider>
  );
};

// --- 3. THE UI CONTENT WRAPPER ---
const AppContent = () => {
  const { currentUser, activeView, setActiveView, login, logout, notifications, fetchInitialData, loading } = useAppContext();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [showDevicePairing, setShowDevicePairing] = useState(false);

  if (showDevicePairing) {
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
    { id: 'ORDER_HUB', icon: Utensils, label: 'Order Hub' },
    { id: 'POS', icon: Grid, label: 'POS Control' },
    { id: 'KITCHEN', icon: Coffee, label: 'KDS Feed' },
    { id: 'LOGISTICS', icon: Bike, label: 'Dispatch' },
    { id: 'ACTIVITY', icon: ShoppingBag, label: 'Activity Log' },
    { id: 'REGISTER', icon: CreditCard, label: 'Register' },
    { id: 'STAFF', icon: Users, label: 'Personnel' },
    { id: 'MENU', icon: Coffee, label: 'Menu Lab' },
    { id: 'SETTINGS', icon: Settings, label: 'System' },
  ];

  return (
    <div className="flex h-screen bg-[#020617] text-slate-200 overflow-hidden">
      <aside
        className={`bg-[#0B0F19] border-r border-slate-800 flex flex-col z-50 transition-all duration-300 ${sidebarExpanded ? 'w-64' : 'w-16'}`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <div className="p-4 flex items-center gap-3 overflow-hidden">
          <div className="bg-gold-500 p-2 rounded-lg text-black font-bold shrink-0">⚡</div>
          <h1 className={`font-serif text-2xl font-bold text-white tracking-tight whitespace-nowrap transition-opacity duration-300 ${sidebarExpanded ? 'opacity-100' : 'opacity-0 w-0'}`}>FIREFLOW</h1>
        </div>
        <nav className="flex-1 px-2 space-y-1 py-4">
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
        <div className="p-2 border-t border-slate-800 space-y-2">
          <button onClick={() => fetchInitialData()} className="w-full flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-white text-xs uppercase rounded-lg hover:bg-slate-800 transition-all">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className={sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}>Sync Data</span>
          </button>
          <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-3 text-red-400 hover:bg-red-900/20 rounded-xl transition-colors">
            <LogOut size={18} className="shrink-0" />
            <span className={sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0 font-bold uppercase text-xs'}>Exit Vault</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 relative bg-slate-950">
        {activeView === 'SUPER_ADMIN' ? <SuperAdminView /> :
          activeView === 'ORDER_HUB' ? <OrderCommandHub /> :
            activeView === 'MENU' ? <MenuView /> :
              activeView === 'DASHBOARD' ? <DashboardView /> :
                activeView === 'POS' ? <POSView /> :
                  activeView === 'KITCHEN' ? <KDSView /> :
                    activeView === 'LOGISTICS' ? <LogisticsHub /> :
                      activeView === 'ACTIVITY' ? <ActivityLog /> :
                        activeView === 'REGISTER' ? <TransactionsView /> :
                          activeView === 'STAFF' ? <StaffView /> :
                            activeView === 'SETTINGS' ? <SettingsView /> :
                              <div className="p-20 text-slate-700 font-black uppercase tracking-[0.3em]">SECURE SECTOR NOT SELECTED</div>}
      </main>

      {/* Global Notifications UI */}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2">
        {notifications.map(n => (
          <div key={n.id} className={`p-4 rounded-lg shadow-2xl border ${n.type === 'error' ? 'bg-red-900/80 border-red-500' : 'bg-slate-900/80 border-gold-500'} text-white text-xs font-bold uppercase tracking-widest animate-in slide-in-from-right`}>
            {n.message}
          </div>
        ))}
      </div>
    </div>
  );
};

// --- 4. FINAL BOOTSTRAP ---
const App = () => (
  <AppProvider>
    <AppContent />
  </AppProvider>
);

export default App;