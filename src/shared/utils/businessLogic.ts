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
  Staff 
} from '../types';

/**
 * CONFIGURATION SETTINGS
 */
export interface RestaurantSettings {
  serviceChargeRate: number;
  taxRate: number;
  defaultDiscountRate: number;
  maxDiscountRate: number;
  deliveryFeeDefault: number;
  peakHourMultiplier: number;
  applyServiceChargeOnTypes: OrderType[];
  applyTaxOnTypes: OrderType[];
  currency: string;
  minimumOrderAmount: number;
}

/**
 * DEFAULT SETTINGS
 */
export const DEFAULT_SETTINGS: RestaurantSettings = {
  serviceChargeRate: 0.05,
  taxRate: 0.16,
  defaultDiscountRate: 0.10,
  maxDiscountRate: 0.50,
  deliveryFeeDefault: 200,
  peakHourMultiplier: 1.0,
  // Fixed: Using the Enum values from OrderType
  applyServiceChargeOnTypes: ['DINE_IN'], 
  applyTaxOnTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
  currency: 'PKR',
  minimumOrderAmount: 0
};

/**
 * SETTINGS MANAGER
 */
export class SettingsManager {
  private static STORAGE_KEY = 'fireflow_restaurant_settings';

  private static loadSettings(): RestaurantSettings {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      localStorage.removeItem(this.STORAGE_KEY);
    }
    return { ...DEFAULT_SETTINGS };
  }

  private static saveSettings(settings: RestaurantSettings): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  static updateSettings(newSettings: Partial<RestaurantSettings>): void {
    const current = this.loadSettings();
    const updated = { ...current, ...newSettings };
    this.saveSettings(updated);
  }

  static getSettings(): RestaurantSettings {
    return this.loadSettings();
  }

  static resetToDefaults(): void {
    this.saveSettings({ ...DEFAULT_SETTINGS });
  }

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
 * Refactored to use snake_case properties from updated OrderItem type
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
    // Fixed: menu_item.price -> unit_price or menu_item.price based on your types.ts
    const price = Number(item.unit_price) || 0; 
    const qty = Number(item.quantity) || 0;

    // Fixed: pricingStrategy sits on menu_item relation
    if (item.menu_item?.pricingStrategy === 'fixed_per_head') {
      if (!processedPerHeadIds.has(item.menu_item_id)) {
        subtotal += price * Math.max(1, guestCount);
        processedPerHeadIds.add(item.menu_item_id);
      }
    } else {
      subtotal += price * qty;
    }
  });

  let discount = Math.max(0, Number(discountAmount) || 0);
  if (discountPercentage > 0) {
    discount = Math.round(subtotal * (discountPercentage / 100));
  }
  
  const maxAllowedDiscount = subtotal * settings.maxDiscountRate;
  discount = Math.min(discount, maxAllowedDiscount);

  const discountedSubtotal = subtotal - discount;

  const shouldApplyServiceCharge = settings.applyServiceChargeOnTypes.includes(type);
  const serviceCharge = shouldApplyServiceCharge 
    ? Math.round(discountedSubtotal * settings.serviceChargeRate) 
    : 0;

  const shouldApplyTax = settings.applyTaxOnTypes.includes(type);
  const tax = shouldApplyTax 
    ? Math.round((discountedSubtotal + serviceCharge) * settings.taxRate) 
    : 0;

  // Fixed: comparison with 'DELIVERY' Enum
  const finalDeliveryFee = type === 'DELIVERY' 
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
 */
export const updateServiceChargeRate = (ratePercentage: number): void => {
  SettingsManager.updateSetting('serviceChargeRate', ratePercentage / 100);
};

export const updateTaxRate = (ratePercentage: number): void => {
  SettingsManager.updateSetting('taxRate', ratePercentage / 100);
};

/**
 * WORKFLOW STATE MACHINE
 */
export const getNextTableState = (
  currentStatus: TableStatus, 
  orderStatus: OrderStatus
): TableStatus => {
  if (orderStatus === OrderStatus.PAID || orderStatus === OrderStatus.CANCELLED || orderStatus === OrderStatus.VOID) {
    return TableStatus.DIRTY;
  }
  if (orderStatus === OrderStatus.READY) {
    // Table remains occupied while waiting for payment/bill
    return TableStatus.OCCUPIED;
  }
  if (orderStatus === OrderStatus.NEW || orderStatus === OrderStatus.COOKING) {
    return TableStatus.OCCUPIED;
  }
  return currentStatus;
};

/**
 * PROVISIONING TEMPLATES
 */
export const SEED_TEMPLATES = {
  sections: [
    { name: 'Royal Hall', prefix: 'R', totalCapacity: 40, isFamilyOnly: false },
    { name: 'Garden Terrace', prefix: 'G', totalCapacity: 30, isFamilyOnly: false },
    { name: 'Family Suite', prefix: 'FS', totalCapacity: 20, isFamilyOnly: true }
  ],
  tables: [
    { name: 'R-1', capacity: 2 }, { name: 'R-2', capacity: 4 }, { name: 'R-3', capacity: 6 }
  ],
  staff: [
    { name: 'Ahmed Khan', role: 'WAITER', pin: '1234' },
    { name: 'Zoya Malik', role: 'CASHIER', pin: '2222' }
  ],
  menu: [
    { name: 'Elite Seekh Kebab', name_urdu: 'سیخ کباب', price: 1450, category: 'starters', station: 'hot', pricingStrategy: 'unit' }
  ]
};

/**
 * UTILITIES
 */
export const generateOrderID = () => {
  const date = new Date();
  const uuid = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${date.getHours()}${date.getMinutes()}-${uuid}`;
};