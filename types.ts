
export interface MenuItem {
  id: string;
  name: string;
  nameUrdu?: string;
  price: number;
  category: 'starters' | 'mains' | 'beverages' | 'desserts';
  station: 'hot' | 'cold' | 'tandoor' | 'bar' | 'dessert';
  image: string;
  pricingStrategy?: 'unit' | 'fixed_per_head';
  available: boolean; 
}

export enum OrderStatus {
  DRAFT = 'DRAFT',
  NEW = 'NEW',
  COOKING = 'COOKING',
  READY = 'READY',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  VOID = 'VOID'
}

export type OrderType = 'dine-in' | 'takeaway' | 'delivery';

export interface OrderItem {
  menuItem: MenuItem;
  quantity: number;
  status: OrderStatus;
  notes?: string;
}

export interface OrderBreakdown {
  subtotal: number;
  serviceCharge: number;
  deliveryFee: number;
  tax: number;
  discount: number;
  total: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  timestamp: Date;
  type: OrderType;
  total: number;
  items: OrderItem[];
  
  deliveryFee?: number;
  breakdown?: OrderBreakdown;

  guestCount?: number;
  tableId?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  assignedDriverId?: string;
  
  createdBy?: string;
  assignedWaiterId?: string;

  cancelledAt?: Date;
  cancelledBy?: string;
  cancellationReason?: string;
  refundAmount?: number;
  
  isSettledWithRider?: boolean;
}

export interface Driver {
  id: string;
  name: string;
  status: 'available' | 'busy' | 'off-duty';
  activeOrderId?: string;
  totalDeliveries: number;
  cashInHand: number;
  lastSettledAt?: Date;
}

export interface Expense {
  id: string;
  category: 'inventory' | 'salary' | 'utilities' | 'rent' | 'marketing' | 'maintenance' | 'other';
  amount: number;
  description: string;
  date: Date;
  processedBy: string;
}

export interface RiderSettlement {
  id: string;
  driverId: string;
  amountCollected: number;
  amountExpected: number;
  shortage: number;
  timestamp: Date;
  processedBy: string;
}

export interface Transaction {
  id: string;
  orderId: string;
  amount: number;
  method: 'CASH' | 'CARD' | 'RAAST';
  tenderedAmount?: number;
  changeGiven?: number;
  timestamp: Date;
  processedBy: string;
}

export enum TableStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  DIRTY = 'DIRTY',
  RESERVED = 'RESERVED'
}

export interface Section {
  id: string;
  name: string;
  prefix: string;
  totalCapacity: number;
  isFamilyOnly: boolean;
}

export interface Server {
  id: string;
  name: string;
  role: 'SUPER_ADMIN' | 'MANAGER' | 'WAITER' | 'CASHIER' | 'DRIVER';
  pin: string;
  activeTables: number;
  restaurantId?: string;
  status?: 'available' | 'busy' | 'off-duty';
  totalDeliveries?: number;
  cashInHand?: number;
}

export interface Table {
  id: string;
  name: string;
  sectionId: string;
  capacity: number;
  status: TableStatus;
  serverId?: string;
  lastStatusChange: Date;
  activeOrderId?: string;
}

export interface Reservation {
  id: string;
  customerName: string;
  phone: string;
  partySize: number;
  reservationTime: Date;
  durationMinutes: number;
  bufferMinutes: number;
  assignedTableId: string;
  status: 'confirmed' | 'seated' | 'cancelled' | 'no_show';
  specialRequests?: string;
}

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  ownerId?: string;
  phone: string;
  address: string;
  city: string;
  subscriptionPlan: 'BASIC' | 'STANDARD' | 'PREMIUM';
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'cancelled';
  trialEndsAt: Date;
  subscriptionExpiresAt: Date;
  monthlyFee: number;
  currency: 'PKR';
  taxRate: number;
  serviceChargeRate: number;
  timezone: 'Asia/Karachi';
  logo?: string;
  primaryColor?: string;
  createdAt: Date;
  isActive: boolean;
}

export interface DiagnosticResult {
  step: string;
  status: 'pending' | 'success' | 'error';
  message: string;
}
