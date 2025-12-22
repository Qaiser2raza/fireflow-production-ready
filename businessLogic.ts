
import { 
  Order, 
  OrderItem, 
  OrderType, 
  OrderBreakdown, 
  MenuItem, 
  TableStatus, 
  OrderStatus, 
  Section, 
  Table, 
  Server 
} from './types';

/**
 * CONFIGURATION SETTINGS
 * Centralized settings that can be easily modified without changing code logic.
 */
export interface RestaurantSettings {
  serviceChargeRate: number;        // As decimal (0.05 = 5%)
  taxRate: number;                  // As decimal (0.16 = 16% GST)
  defaultDiscountRate: number;      // As decimal (0.10 = 10%)
  maxDiscountRate: number;          // Maximum allowed discount (0.50 = 50%)
  deliveryFeeDefault: number;       // Default delivery fee
  peakHourMultiplier: number;       // Price multiplier during peak hours
  applyServiceChargeOnTypes: OrderType[];  // Which order types get service charge
  applyTaxOnTypes: OrderType[];     // Which order types get tax
  currency: string;                 // Currency code
  minimumOrderAmount: number;       // Minimum order value
}

/**
 * DEFAULT SETTINGS
 * These are the baseline settings for the AURA system.
 */
export const DEFAULT_SETTINGS: RestaurantSettings = {
  serviceChargeRate: 0.05,          // 5%
  taxRate: 0.16,                    // 16% GST (typical in Pakistan)
  defaultDiscountRate: 0.10,        // 10%
  maxDiscountRate: 0.50,            // 50% maximum
  deliveryFeeDefault: 200,          // PKR 200
  peakHourMultiplier: 1.0,          // No peak hour pricing by default
  applyServiceChargeOnTypes: ['dine-in'],  // Only dine-in gets service charge
  applyTaxOnTypes: ['dine-in', 'takeaway', 'delivery'],  // All types get tax
  currency: 'PKR',
  minimumOrderAmount: 0             // Set to 0 to disable by default
};

/**
 * SETTINGS MANAGER
 * Helper functions to manage restaurant settings with localStorage persistence
 */
export class SettingsManager {
  private static STORAGE_KEY = 'fireflow_restaurant_settings';

  /**
   * Load settings from localStorage with fallback to defaults
   */
  private static loadSettings(): RestaurantSettings {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to ensure all keys exist
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error);
      // Clear corrupted data
      localStorage.removeItem(this.STORAGE_KEY);
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Save settings to localStorage
   */
  private static saveSettings(settings: RestaurantSettings): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  }

  /**
   * Update restaurant settings
   */
  static updateSettings(newSettings: Partial<RestaurantSettings>): void {
    const current = this.loadSettings();
    const updated = { ...current, ...newSettings };
    this.saveSettings(updated);
  }

  /**
   * Get current settings
   */
  static getSettings(): RestaurantSettings {
    return this.loadSettings();
  }

  /**
   * Reset to default settings
   */
  static resetToDefaults(): void {
    this.saveSettings({ ...DEFAULT_SETTINGS });
  }

  /**
   * Update individual setting
   */
  static updateSetting<K extends keyof RestaurantSettings>(
    key: K, 
    value: RestaurantSettings[K]
  ): void {
    const current = this.loadSettings();
    current[key] = value;
    this.saveSettings(current);
  }
}

/**
 * FINANCIAL ENGINE
 * Centralized calculation of subtotals, service charges, and per-head pricing using SettingsManager.
 */
export const calculateOrderBreakdown = (
  items: OrderItem[], 
  type: OrderType, 
  guestCount: number = 1, 
  deliveryFee?: number,
  discountAmount: number = 0,
  discountPercentage: number = 0
): OrderBreakdown => {
  const settings = SettingsManager.getSettings();
  
  if (!items || items.length === 0) {
    return {
      subtotal: 0,
      serviceCharge: 0,
      deliveryFee: 0,
      tax: 0,
      discount: 0,
      total: 0
    };
  }

  let subtotal = 0;
  const processedPerHeadIds = new Set<string>();

  items.forEach(item => {
    const price = Number(item.menuItem.price) || 0;
    const qty = Number(item.quantity) || 0;

    if (item.menuItem.pricingStrategy === 'fixed_per_head') {
      // Per-head items are charged once per guest, regardless of quantity ordered
      if (!processedPerHeadIds.has(item.menuItem.id)) {
        subtotal += price * Math.max(1, guestCount);
        processedPerHeadIds.add(item.menuItem.id);
      }
    } else {
      subtotal += price * qty;
    }
  });

  // Calculate discount
  let discount = Math.max(0, Number(discountAmount) || 0);
  if (discountPercentage > 0) {
    discount = Math.round(subtotal * (discountPercentage / 100));
  }
  
  // Apply max discount limit from settings
  const maxAllowedDiscount = subtotal * settings.maxDiscountRate;
  discount = Math.min(discount, maxAllowedDiscount);

  const discountedSubtotal = subtotal - discount;

  // Calculate service charge (applied on discounted subtotal)
  const shouldApplyServiceCharge = settings.applyServiceChargeOnTypes.includes(type);
  const serviceCharge = shouldApplyServiceCharge 
    ? Math.round(discountedSubtotal * settings.serviceChargeRate) 
    : 0;

  // Calculate tax (applied on discounted subtotal + service charge)
  const shouldApplyTax = settings.applyTaxOnTypes.includes(type);
  const tax = shouldApplyTax 
    ? Math.round((discountedSubtotal + serviceCharge) * settings.taxRate) 
    : 0;

  // Calculate delivery fee
  const finalDeliveryFee = type === 'delivery' 
    ? (deliveryFee !== undefined ? Number(deliveryFee) : settings.deliveryFeeDefault) 
    : 0;

  const total = discountedSubtotal + serviceCharge + tax + finalDeliveryFee;

  return {
    subtotal,
    serviceCharge,
    deliveryFee: finalDeliveryFee,
    tax,
    discount,
    total
  };
};

/**
 * RATE ADJUSTMENT HELPERS
 * Public utility functions to update common rates globally.
 */
export const updateServiceChargeRate = (ratePercentage: number): void => {
  SettingsManager.updateSetting('serviceChargeRate', ratePercentage / 100);
};

export const updateTaxRate = (ratePercentage: number): void => {
  SettingsManager.updateSetting('taxRate', ratePercentage / 100);
};

export const updateDefaultDiscountRate = (ratePercentage: number): void => {
  SettingsManager.updateSetting('defaultDiscountRate', ratePercentage / 100);
};

export const updateDeliveryFee = (amount: number): void => {
  SettingsManager.updateSetting('deliveryFeeDefault', amount);
};

/**
 * WORKFLOW STATE MACHINE
 * Determines the next physical state of a table based on order actions.
 */
export const getNextTableState = (
  currentStatus: TableStatus, 
  orderStatus: OrderStatus
): TableStatus => {
  if (orderStatus === OrderStatus.PAID || orderStatus === OrderStatus.CANCELLED || orderStatus === OrderStatus.VOID) {
    return TableStatus.DIRTY;
  }
  if (orderStatus === OrderStatus.READY) {
    return TableStatus.PAYMENT_PENDING;
  }
  if (orderStatus === OrderStatus.NEW || orderStatus === OrderStatus.COOKING) {
    return TableStatus.OCCUPIED;
  }
  return currentStatus;
};

/**
 * PROVISIONING TEMPLATES
 * High-fidelity seed data for "AURA Karachi Elite" and standard test environments.
 */
export const SEED_TEMPLATES = {
  sections: [
    { name: 'Royal Hall', prefix: 'R', totalCapacity: 40, isFamilyOnly: false },
    { name: 'Garden Terrace', prefix: 'G', totalCapacity: 30, isFamilyOnly: false },
    { name: 'Family Suite', prefix: 'FS', totalCapacity: 20, isFamilyOnly: true }
  ],
  tables: [
    { name: 'R-1', capacity: 2 }, { name: 'R-2', capacity: 4 }, { name: 'R-3', capacity: 6 },
    { name: 'G-1', capacity: 4 }, { name: 'G-2', capacity: 4 }, { name: 'G-3', capacity: 8 },
    { name: 'FS-1', capacity: 6 }, { name: 'FS-2', capacity: 10 }
  ],
  staff: [
    { name: 'Ahmed Khan', role: 'WAITER', pin: '1234' },
    { name: 'Zoya Malik', role: 'CASHIER', pin: '2222' },
    { name: 'Rider Farhan', role: 'DRIVER', pin: '3333' }
  ],
  menu: [
    { name: 'Elite Seekh Kebab', nameUrdu: 'سیخ کباب', price: 1450, category: 'starters', station: 'hot', pricingStrategy: 'unit' },
    { name: 'Mutton Karahi (Full)', nameUrdu: 'مٹن کڑاہی', price: 3800, category: 'mains', station: 'hot', pricingStrategy: 'unit' },
    { name: 'Premium Garlic Naan', nameUrdu: 'گارلک نان', price: 180, category: 'starters', station: 'tandoor', pricingStrategy: 'fixed_per_head' },
    { name: 'Mint Lemonade Burst', nameUrdu: 'پودینہ لیمونیڈ', price: 550, category: 'beverages', station: 'bar', pricingStrategy: 'unit' },
    { name: 'Traditional Kulfi', nameUrdu: 'کلفی', price: 450, category: 'desserts', station: 'dessert', pricingStrategy: 'unit' }
  ]
};

/**
 * UTILITIES
 */
export const generateOrderID = () => {
  const date = new Date();
  const uuid = crypto.randomUUID().substring(0, 6).toUpperCase();
  return `ORD-${date.getHours()}${date.getMinutes()}-${uuid}`;
};
