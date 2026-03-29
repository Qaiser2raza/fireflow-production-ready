/**
 * FireFlow Bill Engine v2.0
 * ---------------------------------
 * Pure, deterministic billing calculation.
 * Inspired by Toast POS and Square's line-item billing model.
 *
 * Philosophy:
 * - Each bill has a "BillConfig" that can override per-session
 * - Default configs come from operationsConfig → order type templates
 * - Items can be individually tax-exempt (e.g. drinks already include tax)
 * - Discount can be flat amount OR a percentage of subtotal
 */

import { OrderItem, OrderType, PaymentBreakdown } from '../shared/types';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface BillConfig {
  // Discount
  discountValue: number;          // Resolved flat Rs amount
  discountMax: number;            // Max % allowed (v3.2)

  // Service Charge
  svcEnabled: boolean;
  svcRate: number;                // Percentage, e.g. 6 = 6%

  // Tax
  taxEnabled: boolean;
  taxRate: number;                // Percentage, e.g. 16 = 16%
  tax_type: 'INCLUSIVE' | 'EXCLUSIVE';
  taxLabel: string;               // 'GST', 'VAT', 'Tax', etc.
  tax_exempt: boolean;             // Whole order exemption

  // Delivery
  deliveryFee: number;            // Flat Rs amount (0 = free)
}

export interface BillResult extends PaymentBreakdown {
  discountAmount: number;         // Resolved flat Rs discount
  discountPercent: number;        // Resolved % (for display)
  taxableSubtotal: number;        // Subtotal after discount, before tax
  taxExemptAmount: number;        // Items that were skipped from tax
}

// ─────────────────────────────────────────────
// Default Templates by Order Type
// ─────────────────────────────────────────────

export const getDefaultBillConfig = (
  orderType: OrderType,
  operationsConfig: any
): BillConfig => {
  const taxLabel = operationsConfig?.tax_label || operationsConfig?.taxLabel || 'GST';
  const defaultDeliveryFee = Number(operationsConfig?.default_delivery_fee ?? operationsConfig?.defaultDeliveryFee ?? 0);

  // Default fallback if no specific order defaults found
  const baseConfig: BillConfig = {
    discountValue: 0,
    discountMax: 0,
    svcEnabled: false,
    svcRate: 0,
    taxEnabled: true,
    taxRate: 16,
    tax_type: 'INCLUSIVE',
    taxLabel: taxLabel,
    tax_exempt: false,
    deliveryFee: 0
  };

  const orderDefaults = operationsConfig?.order_type_defaults?.[orderType];
  
  if (orderDefaults) {
    return {
      ...baseConfig,
      taxEnabled: Boolean(orderDefaults.tax_enabled),
      taxRate: Number(orderDefaults.tax_rate ?? 16),
      tax_type: orderDefaults.tax_type || 'INCLUSIVE',
      svcEnabled: Boolean(orderDefaults.svc_enabled),
      svcRate: Number(orderDefaults.svc_rate ?? 0),
      deliveryFee: Number(orderDefaults.delivery_fee ?? 0),
      discountMax: Number(orderDefaults.discount_max ?? 0),
      tax_exempt: Boolean(orderDefaults.tax_exempt)
    };
  }

  // Legacy switch statements for backwards compatibility
  switch (orderType) {
    case 'DINE_IN':
      return { ...baseConfig, svcEnabled: true, svcRate: 6 };
    case 'DELIVERY':
      return { ...baseConfig, deliveryFee: defaultDeliveryFee };
    default:
      return baseConfig;
  }
};

// ─────────────────────────────────────────────
// Core Calculation Engine
// ─────────────────────────────────────────────

export const calculateBill = (
  items: OrderItem[],
  config: BillConfig
): BillResult => {
  // 1. Subtotal (items)
  const subtotal = items.reduce(
    (acc, item) => acc + Number(item.unit_price) * item.quantity,
    0
  );

  // 2. Discount -> Taxable Amount
  const discountAmount = Math.min(config.discountValue || 0, subtotal);
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const discountPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;

  // 3. Tax
  let tax = 0;
  if (config.taxEnabled && !config.tax_exempt) {
    if (config.tax_type === 'INCLUSIVE') {
      const rate = config.taxRate / 100;
      tax = taxableAmount - (taxableAmount / (1 + rate));
    } else {
      tax = taxableAmount * (config.taxRate / 100);
    }
  }
  tax = Math.round(tax * 100) / 100;

  // 4. Service Charge (on taxable amount)
  const serviceCharge = config.svcEnabled
    ? Math.round(taxableAmount * (config.svcRate / 100) * 100) / 100
    : 0;

  // 5. Delivery Fee
  const deliveryFee = config.deliveryFee || 0;

  // 6. Total
  const totalRaw = config.tax_type === 'INCLUSIVE'
    ? (taxableAmount + serviceCharge + deliveryFee)
    : (taxableAmount + tax + serviceCharge + deliveryFee);
  
  const total = Math.max(0, Math.round(totalRaw * 100) / 100);

  return {
    subtotal,
    discount: discountAmount,
    discountAmount,
    discountPercent,
    serviceCharge,
    taxableSubtotal: taxableAmount,
    taxExemptAmount: config.tax_exempt ? taxableAmount : 0,
    tax,
    deliveryFee,
    total,
    tax_type: config.tax_type
  };
};
