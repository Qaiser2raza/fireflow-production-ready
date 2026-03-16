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
  discountType: 'flat' | 'percent';
  discountValue: number;          // Amount (Rs) or Percent (%)

  // Service Charge — only DINE_IN typically
  serviceChargeEnabled: boolean;
  serviceChargeRate: number;      // Percentage, e.g. 6 = 6%

  // Tax
  taxEnabled: boolean;
  taxRate: number;                // Percentage, e.g. 16 = 16%
  taxLabel: string;               // 'GST', 'VAT', 'Tax', etc.
  taxInclusive: boolean;          // If true, price already includes tax

  // Delivery
  deliveryFeeEnabled: boolean;
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
  // Check both naming conventions for robustness
  const scRate = Number(operationsConfig?.serviceChargeRate ?? operationsConfig?.service_charge_rate ?? 5);
  const scEnabled = Boolean(operationsConfig?.serviceChargeEnabled ?? operationsConfig?.service_charge_enabled ?? false);
  
  const taxRate = Number(operationsConfig?.taxRate ?? operationsConfig?.tax_rate ?? 16);
  
  const taxLabel = operationsConfig?.taxLabel || operationsConfig?.tax_label || 'GST';
  const defaultDeliveryFee = Number(operationsConfig?.defaultDeliveryFee ?? operationsConfig?.default_delivery_fee ?? 0);

  switch (orderType) {
    case 'DINE_IN':
      return {
        discountType: 'flat',
        discountValue: 0,
        serviceChargeEnabled: scEnabled, // Respect global setting
        serviceChargeRate: scRate,
        taxEnabled: false,       // Default to OFF as per user preference (most are exempt)
        taxRate,
        taxLabel,
        taxInclusive: false,
        deliveryFeeEnabled: false,
        deliveryFee: 0,
      };

    case 'TAKEAWAY':
      return {
        discountType: 'flat',
        discountValue: 0,
        serviceChargeEnabled: false, // Takeaway usually no service charge
        serviceChargeRate: scRate,
        taxEnabled: false,
        taxRate,
        taxLabel,
        taxInclusive: false,
        deliveryFeeEnabled: false,
        deliveryFee: 0,
      };

    case 'DELIVERY':
      return {
        discountType: 'flat',
        discountValue: 0,
        serviceChargeEnabled: false,
        serviceChargeRate: scRate,
        taxEnabled: false,
        taxRate,
        taxLabel,
        taxInclusive: false,
        deliveryFeeEnabled: true,
        deliveryFee: defaultDeliveryFee,
      };

    default:
      return {
        discountType: 'flat',
        discountValue: 0,
        serviceChargeEnabled: false,
        serviceChargeRate: 5,
        taxEnabled: false,
        taxRate: 16,
        taxLabel: 'GST',
        taxInclusive: false,
        deliveryFeeEnabled: false,
        deliveryFee: 0,
      };
  }
};

// ─────────────────────────────────────────────
// Core Calculation Engine
// ─────────────────────────────────────────────

export const calculateBill = (
  items: OrderItem[],
  config: BillConfig
): BillResult => {
  // 1. Subtotal from all items
  const subtotal = items.reduce(
    (acc, item) => acc + Number(item.unit_price) * item.quantity,
    0
  );

  // 2. Discount
  let discountAmount = 0;
  let discountPercent = 0;
  if (config.discountValue > 0) {
    if (config.discountType === 'percent') {
      discountPercent = Math.min(config.discountValue, 100);
      discountAmount = (subtotal * discountPercent) / 100;
    } else {
      discountAmount = Math.min(config.discountValue, subtotal);
      discountPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;
    }
  }
  discountAmount = Math.round(discountAmount * 100) / 100;

  const afterDiscount = subtotal - discountAmount;

  // 3. Service Charge (applied to post-discount subtotal, only if enabled)
  const serviceCharge = config.serviceChargeEnabled
    ? Math.round(afterDiscount * (config.serviceChargeRate / 100) * 100) / 100
    : 0;

  // 4. Tax
  // Tax is calculated on: afterDiscount + serviceCharge (for items NOT tax-exempt)
  // Items with is_tax_exempt flag are skipped
  let taxExemptAmount = 0;
  let taxableBase = 0;

  if (config.taxEnabled) {
    items.forEach(item => {
      const lineTotal = Number(item.unit_price) * item.quantity;
      const lineDiscount = subtotal > 0 ? (lineTotal / subtotal) * discountAmount : 0;
      const lineAfterDiscount = lineTotal - lineDiscount;

      if ((item as any).is_tax_exempt || (item as any).menu_item?.is_tax_exempt) {
        taxExemptAmount += lineAfterDiscount;
      } else {
        taxableBase += lineAfterDiscount;
      }
    });
    // Pro-rate service charge on taxable portion only
    const taxableServiceCharge = taxableBase > 0 && serviceCharge > 0
      ? serviceCharge * (taxableBase / afterDiscount)
      : 0;
    taxableBase += taxableServiceCharge;
  }

  const tax = config.taxEnabled
    ? Math.round(taxableBase * (config.taxRate / 100) * 100) / 100
    : 0;

  // 5. Delivery Fee
  const deliveryFee = config.deliveryFeeEnabled ? config.deliveryFee : 0;

  // 6. Grand Total
  const total = Math.round((afterDiscount + serviceCharge + tax + deliveryFee) * 100) / 100;

  return {
    subtotal,
    discount: discountAmount,
    discountAmount,
    discountPercent,
    serviceCharge,
    taxableSubtotal: taxableBase,
    taxExemptAmount,
    tax,
    deliveryFee,
    total,
  };
};
