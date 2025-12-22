
import React, { useState, createContext, useContext, useEffect, useCallback, useMemo } from 'react';
import { 
  LayoutGrid, 
  ChefHat, 
  CreditCard,
  User,
  ClipboardList,
  Armchair,
  LogOut,
  LayoutDashboard,
  UtensilsCrossed,
  Users,
  Grid,
  Activity,
  Loader2,
  Bike,
  Receipt,
  Settings,
  Menu as MenuIcon,
  MapPin,
  Wallet,
  X,
  AlertCircle,
  CheckCircle2,
  Info,
  Sparkles,
  Zap,
  Terminal,
  FileJson
} from 'lucide-react';
import { RestaurantProvider, useRestaurant } from './RestaurantContext';
import { SubscriptionGuard } from './components/SubscriptionGuard';
import { RegistrationView } from './components/RegistrationView';
import { SuperAdminView } from './components/SuperAdminView';
import { POSView } from './components/POSView';
import { KDSView } from './components/KDSView';
import { DispatchView } from './components/DispatchView';
import { TransactionsView } from './components/TransactionsView';
import { OrdersView } from './components/OrdersView';
import { FloorPlanView } from './components/FloorPlanView';
import { DashboardView } from './components/DashboardView';
import { LoginView } from './components/LoginView';
import { MenuView } from './components/MenuView';
import { StaffView } from './components/StaffView';
import { TableManagementView } from './components/TableManagementView';
import { DriverView } from './components/DriverView';
import { SettingsView } from './components/SettingsView';
import { RiderManagementView } from './components/RiderManagementView';
import { AccountingView } from './components/AccountingView';
import { AURAAssistant } from './components/AURAAssistant';

import { Order, OrderStatus, OrderItem, Driver, Table, Section, Server, TableStatus, Transaction, Reservation, MenuItem, OrderType, OrderBreakdown, Restaurant, RiderSettlement, Expense, DiagnosticResult } from './types';
import { INITIAL_SECTIONS, INITIAL_TABLES, INITIAL_SERVERS, MENU_ITEMS as INITIAL_MENU } from './constants';
import { calculateOrderBreakdown, getNextTableState, SEED_TEMPLATES } from './businessLogic';
import { supabase } from './supabase';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextType {
  currentUser: Server | null;
  orders: Order[];
  drivers: Driver[];
  tables: Table[];
  sections: Section[];
  servers: Server[];
  transactions: Transaction[];
  expenses: Expense[];
  reservations: Reservation[];
  menuItems: MenuItem[];
  connectionStatus: 'connected' | 'connecting' | 'error';
  lastSyncAt: Date | null;
  notifications: Notification[];
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  removeNotification: (id: string) => void;
  login: (user: Server, restaurant: Restaurant) => void;
  logout: () => void;
  addOrder: (order: Order) => Promise<boolean>;
  updateOrder: (order: Order) => Promise<boolean>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<boolean>;
  updateOrderItemStatus: (orderId: string, itemIndex: number, status: OrderStatus) => Promise<boolean>;
  assignDriverToOrder: (orderId: string, driverId: string) => Promise<boolean>;
  completeDelivery: (orderId: string) => Promise<boolean>;
  processPayment: (orderId: string, transaction: Transaction) => Promise<boolean>;
  addExpense: (expense: Expense) => Promise<boolean>;
  cancelOrder: (orderId: string, reason: string, refundAmount?: number) => Promise<boolean>;
  updateTableStatus: (tableId: string, status: TableStatus, serverId?: string, activeOrderId?: string) => Promise<boolean>;
  updateReservationStatus: (id: string, status: Reservation['status']) => Promise<void>;
  addMenuItem: (item: MenuItem) => Promise<{success: boolean, error?: string}>;
  updateMenuItem: (item: MenuItem) => Promise<{success: boolean, error?: string}>;
  deleteMenuItem: (id: string) => Promise<boolean>;
  toggleItemAvailability: (id: string) => Promise<boolean>;
  updateItemPrice: (id: string, price: number) => Promise<boolean>;
  addServer: (server: Server) => Promise<boolean>;
  updateServer: (server: Server) => Promise<boolean>;
  deleteServer: (id: string) => Promise<boolean>;
  /* Fixed: Removed duplicate identifier 'addServerToContext' */
  addServerToContext: (server: Server) => void;
  addSection: (section: Section) => Promise<Section | null>;
  updateSection: (section: Section) => Promise<boolean>;
  deleteSection: (id: string) => Promise<boolean>;
  addTable: (table: Table) => Promise<Table | null>;
  deleteTable: (id: string) => Promise<boolean>;
  seedDatabase: () => Promise<void>;
  runDiagnostics: () => Promise<DiagnosticResult[]>;
  calculateOrderTotal: (items: OrderItem[], type: OrderType, guestCount?: number, customDeliveryFee?: number) => { total: number, breakdown: OrderBreakdown };
  activeView: string;
  setActiveView: (view: string) => void;
  orderToEdit: Order | null;
  setOrderToEdit: (order: Order | null) => void;
  settleRiderCash: (settlement: RiderSettlement) => Promise<boolean>;
  collectSingleOrderFromRider: (orderId: string) => Promise<boolean>;
  settleAllOrdersForRider: (driverId: string) => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};

// SAFE JSON PARSING (Handles double-escaped strings from DB fixes)
const parseOrderItems = (itemsInput: any): OrderItem[] => {
  if (Array.isArray(itemsInput)) return itemsInput;
  if (!itemsInput) return [];
  try {
    // FIX: Single parse - Supabase returns JSONB as objects already
    const items = typeof itemsInput === 'string' ? JSON.parse(itemsInput) : itemsInput;
    return (items || []).map((item: any) => ({
      ...item,
      menuItem: {
        ...item.menuItem,
        nameUrdu: item.menuItem?.name_urdu || item.menuItem?.nameUrdu,
        pricingStrategy: item.menuItem?.pricing_strategy || item.menuItem?.pricingStrategy || 'unit'
      }
    }));
  } catch (e) {
    console.error("Critical Item Parse Failure", e);
    return [];
  }
};

const mapOrderFromDB = (o: any, liveMenuItems: MenuItem[]): Order => {
  const guestCount = Number(o.guest_count || o.guestCount || 1);
  const deliveryFee = Number(o.delivery_fee || o.deliveryFee || 0);
  const items = parseOrderItems(o.items);
  const breakdown = calculateOrderBreakdown(items, o.type as OrderType, guestCount, deliveryFee);
  const rawDate = o.timestamp || o.created_at || new Date().toISOString();
  
  return { 
    ...o, 
    id: String(o.id || ''),
    status: (o.status || OrderStatus.NEW) as OrderStatus,
    timestamp: new Date(rawDate), 
    items: items, 
    total: breakdown.total, 
    breakdown: breakdown,
    guestCount,
    deliveryFee,
    tableId: o.table_id || o.tableId || null,
    assignedDriverId: o.assigned_driver_id || o.assignedDriverId || null,
    assignedWaiterId: o.assigned_waiter_id || o.assignedWaiterId || null,
    isSettledWithRider: o.is_settled_with_rider || o.isSettledWithRider || false,
    customerName: o.customer_name || o.customerName || '',
    customerPhone: o.customer_phone || o.customerPhone || '',
    deliveryAddress: o.delivery_address || o.deliveryAddress || ''
  };
};

const FireflowApp: React.FC = () => {
  const { currentRestaurant, setCurrentRestaurant, isLoading: isRestaurantLoading } = useRestaurant();
  const [currentUser, setCurrentUser] = useState<Server | null>(null);
  const [activeView, setActiveView] = useState<string>('dashboard');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'error'>('connecting');
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderToEdit, setOrderToEdit] = useState<Order | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isAURAModalOpen, setIsAURAModalOpen] = useState(false);

  const addNotification = (type: 'success' | 'error' | 'info', message: string) => {
    const id = crypto.randomUUID();
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => removeNotification(id), 5000);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('fireflow_currentUser');
    if (savedUser && !currentUser) {
      try {
        const user = JSON.parse(savedUser);
        setCurrentUser(user);
      } catch (e) {
        console.error("Failed to restore session", e);
      }
    }
  }, []);

  const drivers = useMemo<Driver[]>(() => {
    return servers.filter(s => s.role === 'DRIVER').map(s => ({
        id: s.id,
        name: s.name || 'Unnamed Rider',
        status: (s.status as any) || 'available',
        totalDeliveries: Number(s.totalDeliveries || 0),
        cashInHand: Number(s.cashInHand || 0)
    }));
  }, [servers]);

  const fetchAllData = useCallback(async (silent = false) => {
    if (!currentRestaurant?.id || currentRestaurant.id === 'NEW') {
      setLoading(false);
      return;
    }

    try {
      if (!silent) setLoading(true);
      const restId = currentRestaurant.id;
      
      const buildQuery = (tableName: string) => {
        let q = supabase.from(tableName).select('*');
        if (restId && restId !== 'SYSTEM') {
          if (tableName === 'menu_items') {
            q = q.or(`restaurant_id.eq.${restId},restaurant_id.is.null`);
          } else {
            q = q.eq('restaurant_id', restId);
          }
        }
        return q;
      };

      const [menuRes, tablesRes, sectionsRes, staffRes, ordersRes, transRes, expRes, resRes] = await Promise.all([
        buildQuery('menu_items'),
        buildQuery('tables'),
        buildQuery('sections'),
        buildQuery('staff'),
        buildQuery('orders').order('timestamp', { ascending: false }).limit(150),
        buildQuery('transactions').order('timestamp', { ascending: false }).limit(100),
        buildQuery('expenses').order('date', { ascending: false }),
        buildQuery('reservations')
      ]);

      if (menuRes.error?.code === '400' || staffRes.error?.code === '400') {
        setConnectionStatus('error');
        setLoading(false);
        return;
      }

      if (menuRes.data) setMenuItems(menuRes.data.map(m => ({ ...m, nameUrdu: m.name_urdu || m.nameUrdu, pricingStrategy: m.pricing_strategy || m.pricingStrategy || 'unit' })));
      if (tablesRes.data) setTables(tablesRes.data.map(t => ({ ...t, sectionId: t.section_id, serverId: t.server_id, activeOrderId: t.active_order_id, lastStatusChange: new Date(t.last_status_change || Date.now()) })));
      if (sectionsRes.data) setSections(sectionsRes.data.map(s => ({ ...s, totalCapacity: s.total_capacity, isFamilyOnly: s.is_family_only })));
      
      if (staffRes.data) setServers(staffRes.data.map((s: any) => ({ 
        ...s, 
        id: String(s.id), 
        restaurantId: s.restaurant_id, 
        activeTables: s.active_tables, 
        totalDeliveries: Number(s.total_deliveries || 0), 
        cashInHand: Number(s.cash_in_hand || 0), 
        lastSettledAt: s.last_settled_at ? new Date(s.last_settled_at) : undefined 
      })));

      if (ordersRes.data) setOrders(ordersRes.data.map(o => mapOrderFromDB(o, menuItems)));
      if (transRes.data) setTransactions(transRes.data.map(t => ({ ...t, orderId: t.order_id, processedBy: t.processed_by, tendered_amount: t.tendered_amount, change_given: t.change_given, timestamp: new Date(t.timestamp) })));
      if (expRes.data) setExpenses(expRes.data.map(e => ({ ...e, processedBy: e.processed_by, date: new Date(e.date) })));
      if (resRes.data) setReservations(resRes.data.map(r => ({ ...r, reservationTime: new Date(r.reservation_time), durationMinutes: r.duration_minutes, bufferMinutes: r.buffer_minutes, assignedTableId: r.assigned_table_id, specialRequests: r.special_requests })));

      setConnectionStatus('connected');
      setLastSyncAt(new Date());
    } catch (err) {
      console.error("Data Fetch Error:", err);
      setConnectionStatus('error');
    } finally {
      setLoading(false);
    }
  }, [currentRestaurant, currentUser, menuItems]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    if (!currentRestaurant?.id) return;
    const restId = currentRestaurant.id;

    const ordersSub = supabase.channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restId}` }, 
        payload => {
          if (payload.eventType === 'INSERT') {
            const newOrder = mapOrderFromDB(payload.new, menuItems);
            setOrders(prev => prev.some(o => o.id === newOrder.id) ? prev : [newOrder, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updatedOrder = mapOrderFromDB(payload.new, menuItems);
            setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
          } else if (payload.eventType === 'DELETE') {
            setOrders(prev => prev.filter(o => o.id !== payload.old.id));
          }
        })
      .subscribe();

    const tablesSub = supabase.channel('tables-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables', filter: `restaurant_id=eq.${restId}` },
        payload => {
          const t = payload.new;
          setTables(prev => prev.map(oldT => oldT.id === t.id ? { ...t, sectionId: t.section_id, serverId: t.server_id, activeOrderId: t.active_order_id, lastStatusChange: new Date(t.last_status_change) } : oldT));
        })
      .subscribe();

    const staffSub = supabase.channel('staff-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff', filter: `restaurant_id=eq.${restId}` },
        payload => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
             const s = payload.new;
             const mappedS = { 
               ...s, 
               id: String(s.id), 
               restaurantId: s.restaurant_id, 
               activeTables: s.active_tables, 
               totalDeliveries: Number(s.total_deliveries || 0), 
               cashInHand: Number(s.cash_in_hand || 0), 
               lastSettledAt: s.last_settled_at ? new Date(s.last_settled_at) : undefined 
             };
             if (payload.eventType === 'INSERT') {
                setServers(prev => prev.some(existing => existing.id === mappedS.id) ? prev : [...prev, mappedS]);
             } else {
                setServers(prev => prev.map(oldS => oldS.id === mappedS.id ? mappedS : oldS));
             }
          } else if (payload.eventType === 'DELETE') {
             setServers(prev => prev.filter(s => s.id !== String(payload.old.id)));
          }
        })
      .subscribe();

    return () => {
      ordersSub.unsubscribe();
      tablesSub.unsubscribe();
      staffSub.unsubscribe();
    };
  }, [currentRestaurant?.id, menuItems]);

  const calculateOrderTotal = (items: OrderItem[], type: OrderType, guestCount: number = 1, customDeliveryFee: number = 0): { total: number, breakdown: OrderBreakdown } => {
    const breakdown = calculateOrderBreakdown(items, type, guestCount, customDeliveryFee);
    return { total: breakdown.total, breakdown };
  };

  const login = (user: Server, restaurant: Restaurant) => {
    setCurrentUser(user);
    setCurrentRestaurant(restaurant);
    localStorage.setItem('fireflow_currentUser', JSON.stringify(user));
    if (user.role === 'SUPER_ADMIN') setActiveView('superadmin');
    else if (user.role === 'DRIVER') setActiveView('driver');
    else setActiveView('dashboard');
  };

  const logout = () => {
    setCurrentUser(null);
    setCurrentRestaurant(null);
    localStorage.removeItem('currentRestaurant');
    localStorage.removeItem('fireflow_currentUser');
  };

  const addOrder = async (order: Order) => {
    try {
      if (!currentRestaurant) return false;
      
      if (order.type === 'dine-in' && order.tableId) {
         const existingOrder = orders.find(o => o.tableId === order.tableId && !['PAID', 'CANCELLED', 'VOID'].includes(o.status));
         if (existingOrder) {
            addNotification('error', `Table Already Occupied. Associate with Ref #${existingOrder.id.split('-').pop()} instead.`);
            return false;
         }
      }

      const tableObj = order.tableId ? tables.find(t => t.id === order.tableId || t.name === order.tableId) : null;
      const payload: any = {
        restaurant_id: currentRestaurant.id, status: order.status, type: order.type, items: JSON.stringify(order.items), 
        total: order.total, delivery_fee: order.type === 'delivery' ? (order.deliveryFee || 0) : null,
        guest_count: order.guestCount || 1,
        customer_name: order.customerName || (order.type === 'dine-in' ? `Table ${tableObj?.name || order.tableId || '?'}` : 'Walk-in'),
        customer_phone: order.customer_phone || null, delivery_address: order.delivery_address || null,
        assigned_driver_id: order.assignedDriverId || null, assigned_waiter_id: order.assignedWaiterId || null,
        created_by: currentUser?.id, timestamp: (order.timestamp || new Date()).toISOString()
      };
      if (tableObj) payload.table_id = tableObj.id;
      const { data, error } = await supabase.from('orders').insert(payload).select().single();
      if (error) {
        addNotification('error', `Order Failed: ${error.message}`);
        return false;
      }
      if (data) {
        const mapped = mapOrderFromDB(data, menuItems);
        setOrders(prev => [mapped, ...prev]);
        if (order.type === 'dine-in' && payload.table_id) {
            const nextStatus = getNextTableState(TableStatus.AVAILABLE, order.status);
            await updateTableStatus(payload.table_id, nextStatus, order.assignedWaiterId, data.id);
        }
        addNotification('success', order.status === OrderStatus.DRAFT ? "Draft Saved" : "Order Fired Successfully");
        return true;
      }
      return false;
    } catch (err) { return false; }
  };

  const updateOrder = async (order: Order) => {
    try {
      const payload: any = {
        status: order.status, items: JSON.stringify(order.items), total: order.total, guest_count: order.guestCount || 1,
        customer_phone: order.customerPhone || null, customer_name: order.customerName || null,
        delivery_address: order.deliveryAddress || null, assigned_driver_id: order.assignedDriverId || null,
        assigned_waiter_id: order.assignedWaiterId || null, delivery_fee: order.type === 'delivery' ? (order.deliveryFee || 0) : null
      };
      if (order.tableId) {
        const table = tables.find(t => t.id === order.tableId || t.name === order.tableId);
        if (table) payload.table_id = table.id;
      }
      const { data, error } = await supabase.from('orders').update(payload).eq('id', order.id).select().single();
      if (error) {
        addNotification('error', `Update Failed: ${error.message}`);
        return false;
      }
      if (data) {
         const mapped = mapOrderFromDB(data, menuItems);
         setOrders(prev => prev.map(o => o.id === mapped.id ? mapped : o));
         if (order.type === 'dine-in' && order.tableId) {
            const table = tables.find(t => t.id === order.tableId);
            const nextStatus = getNextTableState(table?.status || TableStatus.AVAILABLE, order.status);
            await updateTableStatus(order.tableId, nextStatus, order.assignedWaiterId, order.id);
         }
         addNotification('success', "Session Updated");
         return true;
      }
      return false;
    } catch (err) { return false; }
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const order = orders.find(o => o.id === orderId);
      const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
      if (!error && order?.type === 'dine-in' && order.tableId) {
        const table = tables.find(t => t.id === order.tableId);
        const nextStatus = getNextTableState(table?.status || TableStatus.AVAILABLE, status);
        await updateTableStatus(order.tableId, nextStatus, undefined, status === OrderStatus.PAID ? undefined : orderId);
      }
      return !error;
    } catch (err) { return false; }
  };

  const updateOrderItemStatus = async (orderId: string, itemIndex: number, status: OrderStatus) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return false;
      const newItems = [...order.items];
      if (newItems[itemIndex]) {
        newItems[itemIndex] = { ...newItems[itemIndex], status };
      }
      const { error = null } = await supabase.from('orders').update({ items: JSON.stringify(newItems) }).eq('id', orderId);
      return !error;
    } catch (err) { return false; }
  };

  const assignDriverToOrder = async (orderId: string, driverId: string) => {
    try {
      const { error } = await supabase.from('orders').update({ assigned_driver_id: driverId, status: OrderStatus.OUT_FOR_DELIVERY }).eq('id', orderId);
      return !error;
    } catch (err) { return false; }
  };

  const completeDelivery = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status !== 'OUT_FOR_DELIVERY') {
      addNotification('error', 'Order not found or not out for delivery');
      return false;
    }

    try {
      // FIXED: Process payment FIRST before updating cash
      const transaction: Transaction = {
        id: `TXN-DEL-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        orderId: order.id,
        amount: order.total,
        method: 'CASH',
        timestamp: new Date(),
        processedBy: currentUser?.name || 'System',
        tenderedAmount: order.total,
        changeGiven: 0
      };

      // Insert transaction first
      const { error: txError } = await supabase.from('transactions').insert({
        restaurant_id: currentRestaurant?.id,
        order_id: orderId,
        amount: transaction.amount,
        method: transaction.method,
        tendered_amount: transaction.tenderedAmount,
        change_given: transaction.changeGiven,
        processed_by: currentUser?.id,
        timestamp: transaction.timestamp.toISOString()
      });

      if (txError) {
        addNotification('error', 'Payment processing failed');
        throw txError;
      }

      // Only update cash AFTER successful payment
      if (order.assignedDriverId) {
        const rider = servers.find(s => s.id === order.assignedDriverId);
        const newCash = Number(rider?.cashInHand || 0) + Number(order.total);
        
        const { error: cashError } = await supabase.from('staff').update({ 
          cash_in_hand: newCash, 
          total_deliveries: (Number(rider?.totalDeliveries || 0)) + 1 
        }).eq('id', order.assignedDriverId);

        if (cashError) throw cashError;
      }

      // Update order status to DELIVERED and PAID
      const { error: orderError } = await supabase.from('orders').update({ 
        status: OrderStatus.DELIVERED,
        payment_status: 'PAID',
        updated_at: new Date().toISOString()
      }).eq('id', orderId);

      if (orderError) throw orderError;

      // Update local state
      setTransactions(prev => [transaction, ...prev]);
      
      // Force UI update
      await fetchAllData(true);
      
      addNotification('success', `Delivery completed! Payment: ${order.total} PKR`);
      return true;
    } catch (err) {
      console.error('Failed to complete delivery:', err);
      addNotification('error', 'Failed to complete delivery');
      return false;
    }
  };

  const processPayment = async (orderId: string, transaction: Transaction) => {
    try {
      const { error: txError } = await supabase.from('transactions').insert({ restaurant_id: currentRestaurant?.id, order_id: orderId, amount: transaction.amount, method: transaction.method, tendered_amount: transaction.tenderedAmount, change_given: transaction.changeGiven, processed_by: currentUser?.id, timestamp: transaction.timestamp.toISOString() });
      if (txError) throw txError;
      const order = orders.find(o => o.id === orderId);
      const { error: ordError } = await supabase.from('orders').update({ status: OrderStatus.PAID }).eq('id', orderId);
      
      if (!ordError && order?.tableId) {
          await updateTableStatus(order.tableId, TableStatus.DIRTY, undefined, undefined);
      }
      
      setTransactions(prev => [transaction, ...prev]);
      addNotification('success', "Payment Processed");
      return !ordError;
    } catch (err) { return false; }
  };

  const addExpense = async (expense: Expense) => {
    try {
      const { error } = await supabase.from('expenses').insert({
        restaurant_id: currentRestaurant?.id,
        category: expense.category,
        amount: expense.amount,
        description: expense.description,
        date: expense.date.toISOString(),
        processed_by: currentUser?.id
      });
      if (!error) {
        setExpenses(prev => [{ ...expense, processedBy: currentUser?.name || 'Manager' }, ...prev]);
        addNotification('success', "Expense Logged");
        return true;
      }
      return false;
    } catch (err) { return false; }
  };

  const updateTableStatus = async (tableId: string, status: TableStatus, serverId?: string, activeOrderId?: string) => {
    try {
      if (!tableId) return false;
      const table = tables.find(t => t.id === tableId || t.name === tableId);
      if (!table) return false;
      const payload: any = { status, last_status_change: new Date().toISOString(), server_id: serverId || null, active_order_id: activeOrderId || null };
      const { error } = await supabase.from('tables').update(payload).eq('id', table.id);
      if (!error) {
        setTables(prev => prev.map(t => t.id === table.id ? { ...t, status, serverId: payload.server_id, activeOrderId: payload.active_order_id, lastStatusChange: new Date() } : t));
        return true;
      }
      return false;
    } catch (err) { return false; }
  };

  const cancelOrder = async (orderId: string, reason: string, refundAmount?: number) => {
    try {
      const { error } = await supabase.from('orders').update({ status: OrderStatus.CANCELLED, cancellation_reason: reason, refund_amount: refundAmount || 0, cancelled_at: new Date().toISOString(), cancelled_by: currentUser?.id } as any).eq('id', orderId);
      if (!error) {
        const order = orders.find(o => o.id === orderId);
        if (order?.type === 'dine-in' && order.tableId) await updateTableStatus(order.tableId, TableStatus.DIRTY, undefined, undefined);
        addNotification('info', "Order Cancelled");
        return true;
      }
      return false;
    } catch (err) { return false; }
  };

  const updateReservationStatus = async (id: string, status: Reservation['status']): Promise<void> => {
    try {
      const { error } = await supabase.from('reservations').update({ status }).eq('id', id);
      if (!error) setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (err) { console.error(err); }
  };

  const addMenuItem = async (item: MenuItem) => {
    try {
      const payload = { restaurant_id: currentRestaurant?.id, name: item.name, name_urdu: item.nameUrdu, price: item.price, category: item.category, station: item.station, image: item.image, pricing_strategy: item.pricingStrategy || 'unit', available: item.available };
      const { data, error = null } = await supabase.from('menu_items').insert(payload).select().single();
      if (!error && data) { 
        const newItem = { ...data, nameUrdu: data.name_urdu, pricingStrategy: data.pricing_strategy }; 
        setMenuItems(prev => [...prev, newItem]); 
        addNotification('success', "Item Added to Menu");
        return { success: true }; 
      }
      return { success: false, error: error?.message };
    } catch (err) { return { success: false, error: String(err) }; }
  };

  const updateMenuItem = async (item: MenuItem) => {
    try {
      const payload = { name: item.name, name_urdu: item.nameUrdu, price: item.price, category: item.category, station: item.station, image: item.image, pricing_strategy: item.pricingStrategy || 'unit', available: item.available };
      const { error = null } = await supabase.from('menu_items').update(payload).eq('id', item.id);
      if (!error) { 
        setMenuItems(prev => prev.map(m => m.id === item.id ? item : m)); 
        addNotification('success', "Item Updated");
        return { success: true }; 
      }
      return { success: false, error: error?.message || 'Update failed' };
    } catch (err) { return { success: false, error: String(err) }; }
  };

  const deleteMenuItem = async (id: string) => {
    try {
      const { error = null } = await supabase.from('menu_items').delete().eq('id', id);
      if (!error) { 
        setMenuItems(prev => prev.filter(m => m.id !== id)); 
        addNotification('info', "Item Deleted");
        return true; 
      }
      return false;
    } catch (err) { return false; }
  };

  const toggleItemAvailability = async (id: string) => {
    const item = menuItems.find(m => m.id === id);
    if (!item) return false;
    try {
      const { error } = await supabase.from('menu_items').update({ available: !item.available }).eq('id', id);
      if (!error) { setMenuItems(prev => prev.map(m => m.id === id ? { ...m, available: !item.available } : m)); return true; }
      return false;
    } catch (err) { return false; }
  };

  const updateItemPrice = async (id: string, price: number) => {
    try {
      const { error = null } = await supabase.from('menu_items').update({ price }).eq('id', id);
      if (!error) { setMenuItems(prev => prev.map(m => m.id === id ? { ...m, price } : m)); return true; }
      return false;
    } catch (err) { return false; }
  };

  const addServer = async (server: Server) => {
    try {
      const payload = { 
        restaurant_id: currentRestaurant?.id, 
        name: server.name, 
        role: server.role, 
        pin: server.pin, 
        active_tables: server.activeTables || 0, 
        status: server.status || 'available', 
        total_deliveries: server.totalDeliveries || 0, 
        cash_in_hand: server.cashInHand || 0 
      };
      const { data, error = null } = await supabase.from('staff').insert(payload).select().single();
      if (!error && data) { 
        const mappedS = { 
          ...data, 
          id: String(data.id), 
          restaurantId: data.restaurant_id, 
          activeTables: data.active_tables, 
          totalDeliveries: Number(data.total_deliveries || 0), 
          cashInHand: Number(data.cash_in_hand || 0) 
        }; 
        setServers(prev => [...prev, mappedS]); 
        addNotification('success', "Staff Added");
        return true; 
      }
      return false;
    } catch (err) { return false; }
  };

  const updateServer = async (server: Server) => {
    try {
      const payload = { 
        name: server.name, 
        role: server.role, 
        pin: server.pin, 
        status: server.status,
        cash_in_hand: server.cashInHand,
        total_deliveries: server.totalDeliveries
      };
      const { error = null } = await supabase.from('staff').update(payload).eq('id', server.id);
      if (!error) { 
        setServers(prev => prev.map(s => s.id === server.id ? server : s)); 
        return true; 
      }
      return false;
    } catch (err) { return false; }
  };

  const deleteServer = async (id: string) => {
    try {
      const { error = null } = await supabase.from('staff').delete().eq('id', id);
      if (!error) { setServers(prev => prev.filter(s => s.id !== id)); return true; }
      return false;
    } catch (err) { return false; }
  };

  const addServerToContext = (server: Server) => { setServers(prev => prev.some(s => s.id === server.id) ? prev : [...prev, server]); };

  const addSection = async (section: Section): Promise<Section | null> => {
    try {
      const id = section.id && section.id !== 'TEMP' ? section.id : crypto.randomUUID();
      
      const { data, error } = await supabase.from('sections').insert({ 
        id, restaurant_id: currentRestaurant?.id, name: section.name, prefix: section.prefix, total_capacity: section.totalCapacity, is_family_only: section.isFamilyOnly 
      }).select().single();
      
      if (!error && data) { 
        const newSec = { ...data, totalCapacity: data.total_capacity, isFamilyOnly: data.is_family_only }; 
        setSections(prev => [...prev, newSec]); 
        addNotification('success', `Area "${section.name}" Created`);
        return newSec; 
      }
      addNotification('error', `Section Failed: ${error?.message || 'Identity Missing'}`);
      return null;
    } catch (err) { return null; }
  };

  const updateSection = async (section: Section) => {
    try {
      const payload = { name: section.name, prefix: section.prefix, total_capacity: section.totalCapacity, is_family_only: section.isFamilyOnly };
      const { error = null } = await supabase.from('sections').update(payload).eq('id', section.id);
      if (!error) { 
        setSections(prev => prev.map(s => s.id === section.id ? section : s)); 
        addNotification('success', "Area Updated");
        return true; 
      }
      return false;
    } catch (err) { return false; }
  };

  const deleteSection = async (id: string) => {
    try {
      await supabase.from('tables').delete().eq('section_id', id);
      const { error = null } = await supabase.from('sections').delete().eq('id', id);
      if (!error) { 
        setSections(prev => prev.filter(s => s.id !== id)); 
        setTables(prev => prev.filter(t => t.sectionId !== id)); 
        addNotification('info', "Area dissolved");
        return true; 
      }
      return false;
    } catch (err) { return false; }
  };

  const addTable = async (table: Table): Promise<Table | null> => {
    try {
      const id = table.id && table.id !== 'TEMP' ? table.id : crypto.randomUUID();
      const { data: dbData, error: dbError } = await supabase.from('tables').insert({ 
        id, restaurant_id: currentRestaurant?.id, section_id: table.sectionId, name: table.name, capacity: table.capacity, status: table.status, server_id: table.serverId, active_order_id: table.activeOrderId, last_status_change: table.lastStatusChange.toISOString() 
      }).select().single();
      
      if (!dbError && dbData) { 
        const newTable = { ...dbData, sectionId: dbData.section_id, serverId: dbData.server_id, activeOrderId: dbData.active_order_id, lastStatusChange: new Date(dbData.last_status_change) }; 
        setTables(prev => [...prev, newTable]); 
        return newTable; 
      }
      addNotification('error', `Table Failed: ${dbError?.message || 'Section mismatch'}`);
      return null;
    } catch (err) { return null; }
  };

  const deleteTable = async (id: string) => {
    try {
      const { error = null } = await supabase.from('tables').delete().eq('id', id);
      if (!error) { 
        setTables(prev => prev.filter(t => t.id !== id)); 
        addNotification('info', "Table removed");
        return true; 
      }
      return false;
    } catch (err) { return false; }
  };

  const seedDatabase = async () => {
    if (!currentRestaurant) return;
    const restId = currentRestaurant.id;
    try {
        const { data: identityExists } = await supabase.from('restaurants').select('id').eq('id', restId).maybeSingle();
        if (!identityExists) {
            await supabase.from('restaurants').insert({
                id: restId, name: currentRestaurant.name, slug: currentRestaurant.slug || restId.toLowerCase(), phone: currentRestaurant.phone || '03000000000', city: currentRestaurant.city || 'Karachi', subscription_plan: 'PREMIUM', subscription_status: 'active', trial_ends_at: new Date().toISOString(), subscription_expires_at: new Date(Date.now() + 31536000000).toISOString(), monthly_fee: 2500, currency: 'PKR', timezone: 'Asia/Karachi', is_active: true
            });
        }
        await supabase.from('orders').delete().eq('restaurant_id', restId);
        await supabase.from('tables').delete().eq('restaurant_id', restId);
        await supabase.from('sections').delete().eq('restaurant_id', restId);
        await supabase.from('menu_items').delete().eq('restaurant_id', restId);
        await supabase.from('staff').delete().eq('restaurant_id', restId).neq('pin', currentUser?.pin);
        for (const s of SEED_TEMPLATES.staff) { await supabase.from('staff').insert({ restaurant_id: restId, name: s.name, role: s.role, pin: s.pin, active_tables: 0 }); }
        for (const s of SEED_TEMPLATES.sections) {
            const { data: section } = await supabase.from('sections').insert({ restaurant_id: restId, name: s.name, prefix: s.prefix, total_capacity: s.totalCapacity, is_family_only: s.isFamilyOnly }).select().single();
            if (section) {
                const sectionTables = SEED_TEMPLATES.tables.filter(t => t.name.startsWith(s.prefix));
                for (const t of sectionTables) { await supabase.from('tables').insert({ restaurant_id: restId, section_id: section.id, name: t.name, capacity: t.capacity, status: TableStatus.AVAILABLE, last_status_change: new Date().toISOString() }); }
            }
        }
        for (const m of SEED_TEMPLATES.menu) { await supabase.from('menu_items').insert({ restaurant_id: restId, name: m.name, name_urdu: m.nameUrdu, price: m.price, category: m.category, station: m.station, pricing_strategy: m.pricingStrategy || 'unit', available: true }); }
        await fetchAllData();
        addNotification('success', "AURA Intelligence Provisioned Successfully");
    } catch (err) { addNotification('error', "Provisioning Engine Failed"); }
  };

  const runDiagnostics = async () => {
    const results: DiagnosticResult[] = [];
    try {
      const { error } = await supabase.from('restaurants').select('id').limit(1);
      results.push({ step: 'DB Connectivity', status: error ? 'error' : 'success', message: error ? error.message : 'Successfully pinged edge engine.' });
      const { count } = await supabase.from('staff').select('*', { count: 'exact', head: true }).eq('restaurant_id', currentRestaurant?.id);
      results.push({ step: 'Identity Service', status: 'success', message: `Found ${count || 0} active staff profiles.` });
    } catch (err) { results.push({ step: 'Critical Failure', status: 'error', message: String(err) }); }
    return results;
  };

  const settleRiderCash = async (settlement: RiderSettlement) => {
    try {
      const { error: sError } = await supabase.from('rider_settlements').insert({ id: settlement.id, restaurant_id: currentRestaurant?.id, driver_id: settlement.driverId, amount_collected: settlement.amountCollected, amount_expected: settlement.amountExpected, shortage: settlement.shortage, timestamp: settlement.timestamp.toISOString(), processed_by: settlement.processedBy });
      if (sError) throw sError;
      const { error: oError = null } = await supabase.from('orders').update({ is_settled_with_rider: true, status: OrderStatus.PAID }).eq('assigned_driver_id', settlement.driverId).eq('status', OrderStatus.DELIVERED);
      if (oError) throw oError;
      const rider = servers.find(s => s.id === settlement.driverId);
      if (rider) await supabase.from('staff').update({ cash_in_hand: 0, last_settled_at: new Date().toISOString() }).eq('id', rider.id);
      await fetchAllData(true);
      addNotification('success', "Rider Cash Settled");
      return true;
    } catch (err) { return false; }
  };

  const collectSingleOrderFromRider = async (orderId: string) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order || !order.assignedDriverId) return false;
      
      // Step 1: Record Transaction
      const txn: Transaction = { 
        id: `TXN-RDR-${crypto.randomUUID().substring(0, 8).toUpperCase()}`, 
        orderId: orderId, 
        amount: order.total, 
        method: 'CASH', 
        timestamp: new Date(), 
        processedBy: currentUser?.name || 'Staff' 
      };
      
      const success = await processPayment(orderId, txn);
      if (!success) throw new Error("Vault error");

      // Step 2: Explicit Settlement Update
      await supabase.from('orders').update({ 
        is_settled_with_rider: true,
        status: OrderStatus.PAID 
      }).eq('id', orderId);

      // Step 3: Decrement Rider Cash
      const rider = servers.find(s => s.id === order.assignedDriverId);
      const newCash = Math.max(0, (Number(rider?.cashInHand || 0)) - Number(order.total));
      await supabase.from('staff').update({ cash_in_hand: newCash }).eq('id', order.assignedDriverId);
      
      // Step 4: Silent refresh of local state
      await fetchAllData(true);
      return true;
    } catch (err) { 
      console.error("Logistic Settle Error:", err);
      return false; 
    }
  };

  const settleAllOrdersForRider = async (driverId: string) => {
    const rider = drivers.find(d => d.id === driverId);
    if (!rider || rider.cashInHand <= 0) return false;
    const settlement: RiderSettlement = { id: `SET-AUTO-${crypto.randomUUID().substring(0, 8).toUpperCase()}`, driverId, amountCollected: rider.cashInHand, amountExpected: rider.cashInHand, shortage: 0, timestamp: new Date(), processedBy: currentUser?.name || 'Manager' };
    return await settleRiderCash(settlement);
  };

  const contextValue: AppContextType = { currentUser, orders, drivers, tables, sections, servers, transactions, expenses, reservations, menuItems, connectionStatus, lastSyncAt, notifications, addNotification, removeNotification, login, logout, addOrder, updateOrder, updateOrderStatus, updateOrderItemStatus, assignDriverToOrder, completeDelivery, processPayment, addExpense, cancelOrder, updateTableStatus, updateReservationStatus, addMenuItem, updateMenuItem, deleteMenuItem, toggleItemAvailability, updateItemPrice, addServer, updateServer, deleteServer, addServerToContext, addSection, updateSection, deleteSection, addTable, deleteTable, seedDatabase, runDiagnostics, calculateOrderTotal, activeView, setActiveView, orderToEdit, setOrderToEdit, settleRiderCash, collectSingleOrderFromRider, settleAllOrdersForRider };

  if (isRestaurantLoading || (loading && currentUser)) return <div className="h-screen bg-slate-950 flex items-center justify-center text-white"><div className="flex flex-col items-center gap-4"><Loader2 className="animate-spin text-gold-500" size={40} /><span className="text-xs font-black uppercase tracking-[0.3em]">Igniting AURA Engine...</span></div></div>;
  if (!currentUser) return isRegistering ? <RegistrationView onRegister={(r, o) => login(o, r)} /> : <LoginView onLogin={login} onStartRegistration={() => setIsRegistering(true)} />;

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView />;
      case 'pos': return <POSView />;
      case 'kds': return <KDSView />;
      case 'dispatch': return <DispatchView />;
      case 'orders': return <OrdersView />;
      case 'floorplan': return <FloorPlanView />;
      case 'transactions': return <TransactionsView />;
      case 'menu': return <MenuView />;
      case 'staff': return <StaffView />;
      case 'tables': return <TableManagementView />;
      case 'accounting': return <AccountingView />;
      case 'driver': return <DriverView />;
      case 'settings': return <SettingsView />;
      case 'riders': return <RiderManagementView />;
      case 'superadmin': return <SuperAdminView />;
      default: return <DashboardView />;
    }
  };

  return (
    <AppContext.Provider value={contextValue}>
      <SubscriptionGuard>
        <div className="flex h-screen w-screen bg-slate-950 overflow-hidden relative">
          
          <div className="fixed top-6 right-6 z-[999] flex flex-col gap-3 max-w-sm w-full">
             {notifications.map(n => (
               <div key={n.id} className={`p-4 rounded-2xl shadow-2xl border flex items-start gap-3 animate-in slide-in-from-right-10 duration-300 ${
                 n.type === 'error' ? 'bg-red-950/90 border-red-500/50 text-red-200' : 
                 n.type === 'success' ? 'bg-green-950/90 border-green-500/50 text-green-200' : 
                 'bg-slate-900/90 border-slate-700 text-slate-200'
               }`}>
                  <div className="mt-1">
                    {n.type === 'error' && <AlertCircle size={18} className="text-red-500"/>}
                    {n.type === 'success' && <CheckCircle2 size={18} className="text-green-500"/>}
                    {n.type === 'info' && <Info size={18} className="text-blue-500"/>}
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{n.type}</div>
                    <div className="text-sm font-medium leading-relaxed">{n.message}</div>
                  </div>
                  <button onClick={() => removeNotification(n.id)} className="text-slate-500 hover:text-white"><X size={16}/></button>
               </div>
             ))}
          </div>

          {currentUser.role !== 'DRIVER' && currentUser.role !== 'SUPER_ADMIN' && (
            <div className="w-16 md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 relative z-20">
              <div className="p-4 border-b border-slate-800 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gold-500 flex items-center justify-center shadow-lg shadow-gold-500/20">
                  <Zap size={18} className="text-slate-950" />
                </div>
                <span className="hidden md:block font-serif font-bold text-white uppercase tracking-[0.2em]">Fireflow</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                <NavButton icon={<LayoutDashboard size={20}/>} label="AURA Dash" active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} />
                <NavButton icon={<Armchair size={20}/>} label="Floor Map" active={activeView === 'floorplan'} onClick={() => setActiveView('floorplan')} />
                <NavButton icon={<Grid size={20}/>} label="POS Control" active={activeView === 'pos'} onClick={() => setActiveView('pos')} />
                <NavButton icon={<ChefHat size={20}/>} label="KDS Feed" active={activeView === 'kds'} onClick={() => setActiveView('kds')} />
                <NavButton icon={<Bike size={20}/>} label="Dispatch" active={activeView === 'dispatch'} onClick={() => setActiveView('dispatch')} />
                <NavButton icon={<ClipboardList size={20}/>} label="Order Stream" active={activeView === 'orders'} onClick={() => setActiveView('orders')} />
                <NavButton icon={<Receipt size={20}/>} label="Register" active={activeView === 'transactions'} onClick={() => setActiveView('transactions')} />
                
                <div className="pt-4 pb-2 px-3 hidden md:block text-[10px] font-black text-slate-600 uppercase tracking-widest">Management</div>
                <NavButton icon={<Users size={20}/>} label="Personnel" active={activeView === 'staff'} onClick={() => setActiveView('staff')} />
                <NavButton icon={<MenuIcon size={20}/>} label="Menu Lab" active={activeView === 'menu'} onClick={() => setActiveView('menu')} />
                <NavButton icon={<LayoutGrid size={20}/>} label="Topology" active={activeView === 'tables'} onClick={() => setActiveView('tables')} />
                <NavButton icon={<Wallet size={20}/>} label="Vault" active={activeView === 'accounting'} onClick={() => setActiveView('accounting')} />
                <NavButton icon={<Settings size={20}/>} label="Settings" active={activeView === 'settings'} onClick={() => setActiveView('settings')} />
              </div>
              <div className="p-4 border-t border-slate-800">
                <button onClick={logout} className="w-full flex items-center gap-3 p-3 text-slate-500 hover:text-white transition-colors">
                  <LogOut size={20} />
                  <span className="hidden md:block font-bold text-xs uppercase tracking-widest">Exit Vault</span>
                </button>
              </div>
            </div>
          )}
          <div className="flex-1 h-full overflow-hidden flex flex-col relative z-10">{renderView()}</div>

          {currentUser && currentUser.role !== 'DRIVER' && (
            <button 
              onClick={() => setIsAURAModalOpen(true)}
              className="fixed bottom-6 right-6 z-[100] w-14 h-14 bg-gold-500 text-slate-950 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group overflow-hidden border-2 border-slate-900"
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
              <Sparkles size={24} className="relative z-10 group-hover:rotate-12 transition-transform" />
            </button>
          )}

          {isAURAModalOpen && (
            <AURAAssistant 
              onClose={() => setIsAURAModalOpen(false)} 
              context={{ orders, tables, menuItems, currentUser }}
            />
          )}
        </div>
      </SubscriptionGuard>
    </AppContext.Provider>
  );
};

const NavButton: React.FC<{ icon: React.ReactNode, label: string, active: boolean, onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all ${active ? 'bg-gold-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}>
    {icon}
    <span className="hidden md:block font-bold text-xs uppercase tracking-widest">{label}</span>
  </button>
);

const App: React.FC = () => (
  <RestaurantProvider><FireflowApp /></RestaurantProvider>
);

export default App;
