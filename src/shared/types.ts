// src/types.ts

// --- 1. CORE ENUMS & TYPES ---

export type UserRole = 'ADMIN' | 'SUPER_ADMIN' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'CHEF' | 'RIDER' | 'DRIVER';

export type SectionType = 'DINING' | 'DELIVERY' | 'TAKEAWAY' | 'HIDDEN';

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'RESERVATION';

export enum OrderStatus {
    ACTIVE = 'ACTIVE',
    READY = 'READY',
    DELIVERED = 'DELIVERED',
    CLOSED = 'CLOSED',
    CANCELLED = 'CANCELLED',
    VOIDED = 'VOIDED'
}

export enum ItemStatus {
    DRAFT = 'DRAFT',
    PENDING = 'PENDING',
    PREPARING = 'PREPARING',
    DONE = 'DONE',
    SERVED = 'SERVED',
    SKIPPED = 'SKIPPED'
}

export enum TableStatus {
    AVAILABLE = 'AVAILABLE',
    OCCUPIED = 'OCCUPIED',
    DIRTY = 'DIRTY',
    CLEANING = 'CLEANING',
    RESERVED = 'RESERVED',
    OUT_OF_SERVICE = 'OUT_OF_SERVICE'
}

export enum PaymentStatus {
    UNPAID = 'UNPAID',
    PAID = 'PAID',
    PARTIALLY_PAID = 'PARTIALLY_PAID',
    REFUNDED = 'REFUNDED'
}

export interface Customer {
    id: string;
    restaurant_id: string;
    name?: string;
    phone: string;
    address?: string;
    notes?: string;
    created_at?: Date | string;
    updated_at?: Date | string;
}

export interface Vendor {
    id: string;
    restaurant_id: string;
    name: string;
    phone?: string;
    category: string;
    created_at?: Date | string;
}

export interface Station {
    id: string;
    restaurant_id: string;
    name: string;
    is_active: boolean;
    created_at?: Date | string;
}

// --- 2. ENTITY INTERFACES ---

export interface Restaurant {
    id: string;
    name: string;
    phone?: string;
    address?: string;
    subscriptionStatus: 'trial' | 'active' | 'expired' | 'cancelled';
    subscriptionPlan: 'BASIC' | 'STANDARD' | 'PREMIUM';
    subscriptionExpiresAt: Date;
    trialEndsAt?: Date;
    createdAt: Date;
    serviceChargeEnabled?: boolean;
    service_charge_enabled?: boolean;
    serviceChargeRate?: number;
    service_charge_rate?: number;
    taxEnabled?: boolean;
    tax_enabled?: boolean;
    taxRate?: number;
    tax_rate?: number;
    defaultDeliveryFee?: number;
    default_delivery_fee?: number;
}

export interface Staff {
    id: string;
    restaurant_id?: string;
    // camelCase alias used in fixtures
    restaurantId?: string;
    name: string;
    role: UserRole;
    pin: string;
    image?: string | null;
    status: string;
    active_tables?: number;
    totalDeliveries?: number;
    total_deliveries?: number; // DB alias
    active_shift?: RiderShift | null;
}

export interface RiderShift {
    id: string;
    restaurant_id: string;
    rider_id: string;
    opened_by: string;
    closed_by?: string;
    opened_at: string | Date;
    closed_at?: string | Date;
    opening_float: number;
    closing_cash_received?: number;
    expected_cash?: number;
    cash_difference?: number;
    status: 'OPEN' | 'CLOSED';
    notes?: string;
}

export interface Section {
    id: string;
    restaurant_id?: string;
    name: string;
    name_urdu?: string; // Add this
    type: SectionType;
    prefix?: string;
    priority?: number;
    is_active?: boolean;
    color_code?: string;
    // legacy fixture fields
    totalCapacity?: number;
    isFamilyOnly?: boolean;
}

export interface Table {
    id: string;
    restaurant_id?: string;
    // camelCase alias used in fixtures
    restaurantId?: string;
    name: string;
    section_id?: string;
    // alias used in fixtures
    sectionId?: string;
    capacity: number;
    min_capacity?: number;
    max_capacity?: number;
    status: TableStatus;
    x_position?: number;
    y_position?: number;
    width?: number;
    height?: number;
    rotation?: number;
    shape?: 'SQUARE' | 'RECT' | 'ROUND' | 'OVAL' | 'BOOTH';
    active_order_id?: string;
    merge_id?: string;
    is_virtual?: boolean;
    virtual_type?: string;
    parent_tables?: any;
    qr_code_url?: string;
    is_active?: boolean;
    notes?: string;
    tags?: string[];
    last_cleaned_at?: Date | string;
    last_cleaned_by?: string;
    last_status_change?: Date;
    serverId?: string;
}

export interface MenuItem {
    id: string;
    restaurant_id?: string;
    name: string;
    price: number;
    cost_price?: number;
    category: string;
    station: string;
    station_id?: string;
    requires_prep?: boolean;
    available: boolean;
    image?: string;
    name_urdu?: string;
    track_stock?: boolean;
    // legacy / alternative API fields
    image_url?: string;
    is_available?: boolean;
    // camelCase legacy used in some fixtures
    nameUrdu?: string;
    // optional pricing strategy for per-head pricing
    pricingStrategy?: 'fixed_per_head' | 'fixed' | 'per_item' | 'unit';
    daily_stock?: number;
    description?: string;
    category_id?: string;
    // Included relation
    category_rel?: MenuCategory;
    station_rel?: Station;
}

export interface MenuCategory {
    id: string;
    restaurant_id: string;
    name: string;
    name_urdu?: string;
    priority: number;
}

export interface OrderItem {
    id: string;
    order_id?: string;
    menu_item_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    item_status: string; // DB: item_status
    station?: string;
    station_id?: string;
    modifications?: any;
    item_name?: string;
    category?: string;
    special_instructions?: string;
    notes?: string; // Add alias for notes
    // helpers for UI if needed, but DB is source of truth
    menu_item?: MenuItem; // Optional, if included in fetch
    station_rel?: Station;
}

export interface DineInOrder {
    id: string;
    order_id: string;
    table_id: string;
    guest_count: number;
    waiter_id?: string;
    seated_at: Date | string;
}

export interface TakeawayOrder {
    id: string;
    order_id: string;
    token_number: string;
    token_date?: string;  // Date string for daily reset (YYYY-MM-DD)
    customer_name?: string;
    customerName?: string;
    customer_phone?: string;
    customerPhone?: string;
    pickup_time?: Date | string;
    actual_pickup_time?: Date | string;  // When customer actually picked up
    is_picked_up?: boolean;  // Handoff confirmation
    customer_id?: string;
    customer?: Customer;
}

export interface DeliveryOrder {
    id: string;
    order_id: string;
    customer_name?: string;
    customerName?: string;
    customer_phone: string;
    customerPhone?: string;
    delivery_address?: string;
    deliveryAddress?: string;
    customer_id?: string;
    customer?: Customer;
    driver_id?: string;
    dispatched_at?: Date | string;
    delivered_at?: Date | string;
}

export interface ReservationOrder {
    id: string;
    order_id: string;
    customer_name: string;
    customer_phone: string;
    table_id?: string;
    guest_count: number;
    reservation_time: Date | string;
    arrival_status: string;
}

export interface Order {
    id: string;
    order_number?: string;
    restaurant_id: string;
    status: OrderStatus;
    payment_status: PaymentStatus; // v3.0: Added this field
    type: OrderType;
    total: number;
    created_at: string | Date;
    updated_at: string | Date;
    guest_count?: number;
    customer_name?: string;
    customer_phone?: string;
    last_action_by?: string;
    last_action_desc?: string;
    last_action_at?: Date | string;
    delivery_address?: string;
    deliveryAddress?: string;
    rider_shift_id?: string;
    customer_id?: string;
    closed_at?: Date | string;
    completed_at?: Date | string;

    // New Relation Fields
    table_id?: string;
    table?: Table;
    assigned_driver_id?: string;
    assigned_waiter_id?: string;
    order_items?: OrderItem[];
    dine_in_orders?: DineInOrder[]; // Array due to Prisma definition, effectively 1
    takeaway_orders?: TakeawayOrder[];
    delivery_orders?: DeliveryOrder[];
    reservation_orders?: ReservationOrder[];

    // Legacy fields (Deprecating, but keeping optional for easy refactor if needed, 
    // but ideally we remove them to force fix)
    // Converting to snake_case for what remains on root order if any?
    // No, these are moved to extensions.
    // We keep them optional to avoid immediate compilation hell if we want to shim?
    // No, strict refactor is better.

    // Financials
    service_charge?: number;
    delivery_fee?: number;
    tax?: number;
    discount?: number;
    breakdown?: any;
    restaurants?: Restaurant; // Add restaurant relation
    payment_method?: string; // Add payment method
    notes?: string; // Global order notes

    // Virtual fields for convenience (populated in App.tsx)
    // delivery_address?: string; (removed duplicate)
    customerName?: string;
    customerPhone?: string;
    guestCount?: number;
    tableId?: string | null;
    timestamp?: Date;
}

export interface Customer {
    id: string;
    restaurant_id: string;
    name?: string;
    phone: string;
    address?: string;
    notes?: string;
    created_at?: string | Date;
    updated_at?: string | Date;
    addresses?: CustomerAddress[];
    total_orders?: number;
    last_order_at?: string | Date;
}

export interface CustomerAddress {
    id: string;
    customer_id: string;
    label: string;
    full_address: string;
    landmarks?: string;
    is_default: boolean;
    created_at?: string | Date;
}

export interface PaymentBreakdown {
    subtotal: number;
    serviceCharge: number;
    tax: number;
    deliveryFee: number;
    discount: number;
    total: number;
}

// Backwards-compatible alias names expected elsewhere in the codebase
export type OrderBreakdown = PaymentBreakdown;

// Some modules expect a `Server` type; reuse `Staff` for that role
export type Server = Staff;

// Reservation / table operations helper types (lightweight stubs)
export interface ReservationConflict {
    tableId?: string;
    conflictingReservationId?: string;
    reservation?: Reservation;
    minutesUntil?: number;
    message?: string;
}

export interface VisualState {
    occupiedTables?: string[];
    freeTables?: string[];
    // UI helpers used by FloorPlanView
    className?: string;
    animation?: string;
    reservation?: Reservation | null;
    icon?: string | null;
}

export interface ValidationResult {
    // allow both naming conventions used across the codebase
    valid?: boolean;
    isValid?: boolean;
    errors?: string[];
}

export interface Transaction {
    id: string;
    orderId?: string;
    order_id?: string;
    amount: number;
    payment_method: 'CASH' | 'CARD' | 'RAAST' | 'JAZZCASH' | 'EASYPAISA' | 'RIDER_WALLET';
    method?: 'CASH' | 'CARD' | 'RAAST' | 'JAZZCASH' | 'EASYPAISA' | 'RIDER_WALLET'; // Deprecated alias
    status: 'PAID' | 'REFUNDED' | 'VOIDED';
    transaction_ref?: string;
    type?: 'PAYMENT' | 'REFUND';
    timestamp: Date;
    created_at?: Date | string;
    processedBy: string;
    tenderedAmount?: number;
    changeGiven?: number;
    staff?: { id: string, name: string };
}

export interface RiderSettlement {
    id: string;
    driverId: string;
    orderIds: string[];
    amountExpected: number;
    amountReceived: number;
    floatGiven: number;
    shortage: number;
    timestamp: Date;
    processedBy: string;
    notes?: string;
}

export interface Expense {
    id: string;
    date: Date;
    amount: number;
    category: 'inventory' | 'salary' | 'rent' | 'utilities' | 'marketing' | 'other';
    description: string;
    processedBy: string;
}

export interface LedgerEntry {
    id: string;
    restaurant_id: string;
    account_id?: string | null; // Null = System/Cash/Revenue
    transaction_type: 'DEBIT' | 'CREDIT';
    amount: number;
    reference_type: 'ORDER' | 'SETTLEMENT' | 'PAYOUT' | 'STOCK_IN' | 'OPENING_BALANCE';
    reference_id?: string;
    description?: string;
    processed_by?: string;
    created_at: Date | string;
}

export interface Notification {
    id: string;
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
}

export interface Reservation {
    id: string;
    restaurant_id: string;
    customer_name: string;
    customer_phone?: string;
    table_id: string;
    reservation_time: Date;
    guests: number;
    status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
}

export interface AppContextType {
    currentUser: Staff | null;
    orders: Order[];
    drivers: Staff[];
    servers: Staff[];
    tables: Table[];
    sections: Section[];
    menuItems: MenuItem[];
    menuCategories: MenuCategory[];
    transactions: Transaction[];
    expenses: Expense[];
    reservations: Reservation[];
    notifications: Notification[];
    loading: boolean;
    activeView: string;
    orderToEdit?: Order;
    setActiveView: (view: string) => void;
    setOrderToEdit: (order: Order | null) => void;
    login: (pin: string) => Promise<boolean>;
    logout: () => void;
    addNotification: (type: 'success' | 'error' | 'info' | 'warning', msg: string) => void;
    removeNotification: (id: string) => void;
    fetchInitialData: () => Promise<void>;
    addOrder: (order: Partial<Order>) => Promise<any>;
    updateOrder: (order: Partial<Order>) => Promise<any>;
    cancelOrder: (id: string, reason: string, notes?: string) => Promise<boolean>;
    voidOrder: (id: string, reason: string, notes: string, refundMethod: string, managerPin: string) => Promise<boolean>;
    updateOrderStatus: (id: string, status: OrderStatus) => Promise<void>;
    updateOrderItemStatus: (orderId: string, itemIndex: number, status: OrderStatus) => Promise<boolean>;
    calculateOrderTotal: (items: OrderItem[], type: OrderType, guests: number, fee: number) => PaymentBreakdown;
    addSection: (s: any) => Promise<any>;
    deleteSection: (id: string) => Promise<void>;
    updateSection: (s: any) => Promise<boolean>;
    addTable: (t: any) => Promise<boolean>;
    deleteTable: (id: string) => Promise<void>;
    updateTableStatus: (id: string, status: TableStatus, serverId?: string, orderId?: string) => Promise<boolean>;
    updateTableCapacity: (id: string, capacity: number) => Promise<boolean>;
    seatGuests: (tableId: string, count: number) => Promise<void>;
    processPayment: (orderId: string, transaction: Transaction) => Promise<boolean>;
    assignDriverToOrder: (orderId: string, driverId: string, floatAmount?: number) => Promise<void>;
    completeDelivery: (orderId: string) => Promise<void>;
    settleRiderCash: (settlement: RiderSettlement) => Promise<boolean>;
    addExpense: (expense: Expense) => Promise<void>;
    updateReservationStatus: (id: string, status: string) => Promise<void>;
    addMenuItem: (i: any) => Promise<void>;
    updateMenuItem: (i: any) => Promise<void>;
    deleteMenuItem: (i: string) => Promise<void>;
    toggleItemAvailability: (id: string) => Promise<void>;
    updateItemPrice: (id: string, price: number) => Promise<void>;
    // Categories
    addMenuCategory: (category: Partial<MenuCategory>) => Promise<void>;
    updateMenuCategory: (category: Partial<MenuCategory>) => Promise<void>;
    deleteMenuCategory: (id: string) => Promise<void>;
    addServer: (s: any) => Promise<void>;
    updateServer: (s: any) => Promise<void>;
    deleteServer: (i: string) => Promise<void>;
    addServerToContext: (s: Staff) => void;
    seedDatabase: () => Promise<void>;
    runDiagnostics: () => Promise<any>;

    // New Entities & Props
    connectionStatus: 'connected' | 'disconnected';
    lastSyncAt?: Date;
    customers: Customer[];
    vendors: Vendor[];

    updateTable: (t: any) => Promise<void>;

    addCustomer: (c: any) => Promise<void>;
    updateCustomer: (c: any) => Promise<void>;
    deleteCustomer: (id: string) => Promise<void>;

    addVendor: (v: any) => Promise<void>;
    updateVendor: (v: any) => Promise<void>;
    deleteVendor: (id: string) => Promise<void>;

    // Stations
    stations: Station[];
    addStation: (s: any) => Promise<void>;
    updateStation: (s: any) => Promise<void>;
    deleteStation: (id: string) => Promise<void>;

    socket?: any; // Socket.IO instance
}