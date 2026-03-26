import { OrderStatus, PaymentStatus } from '../types';

export interface StatusStyle {
    label: string;
    color: string;
    bg: string;
}

/**
 * Calculates a human-readable status combining operational state and payment state.
 * This is used for a consistent look across Command Hub, History, and Transactions.
 */
export const getCompositeStatus = (status: OrderStatus, paymentStatus: PaymentStatus): StatusStyle => {
    const s = status as string;
    // 1. Terminal States
    if (s === 'CANCELLED') return { label: 'Cancelled', color: 'text-red-500', bg: 'bg-red-500/10' };
    if (s === 'VOIDED' || s === 'VOID') return { label: 'Voided', color: 'text-slate-500', bg: 'bg-slate-500/10' };
    
    // 2. Payment Overrides
    if (paymentStatus === PaymentStatus.PAID) {
        if (status === OrderStatus.CLOSED) return { label: 'Paid & Closed', color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
        return { label: 'Paid (Active)', color: 'text-blue-500', bg: 'bg-blue-500/10' };
    }
    
    if (paymentStatus === PaymentStatus.PARTIALLY_PAID) {
        return { label: 'Partial Pay', color: 'text-orange-500', bg: 'bg-orange-500/10' };
    }

    if (paymentStatus === PaymentStatus.REFUNDED) {
        return { label: 'Refunded', color: 'text-purple-500', bg: 'bg-purple-500/10' };
    }
    
    // 3. Operational Fallback
    switch (status) {
        case OrderStatus.PENDING: 
        case OrderStatus.ACTIVE:
            return { label: 'Pending', color: 'text-amber-500', bg: 'bg-amber-500/10' };
        case OrderStatus.PREPARING: 
            return { label: 'Preparing', color: 'text-indigo-400', bg: 'bg-indigo-400/10' };
        case OrderStatus.READY: 
            return { label: 'Ready', color: 'text-green-400', bg: 'bg-green-400/10' };
        case OrderStatus.SERVED: 
            return { label: 'Served', color: 'text-emerald-400', bg: 'bg-emerald-400/10' };
        case OrderStatus.DELIVERED: 
            return { label: 'Delivered', color: 'text-blue-500', bg: 'bg-blue-500/10' };
        case OrderStatus.BILL_REQUESTED:
            return { label: 'Bill Sent', color: 'text-pink-500', bg: 'bg-pink-500/10' };
        case OrderStatus.CLOSED:
            return { label: 'Closed (Unpaid)', color: 'text-red-400', bg: 'bg-red-400/10' };
        default: 
            return { label: status, color: 'text-slate-400', bg: 'bg-slate-400/10' };
    }
};
