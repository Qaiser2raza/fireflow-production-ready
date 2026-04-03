
import React from 'react';
import { Order } from '../types';

interface ThermalReceiptProps {
    order: Order;
    width?: string; // e.g., '58mm' or '80mm' -> mapped to pixels
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({ order, width = '380px' }) => {
    // Load local config for identity overrides
    const config = JSON.parse(localStorage.getItem(`fireflow_operations_config_${order.restaurant_id}`) || '{}');

    // Helper to format currency
    const formatCurrency = (amount: number) => `Rs. ${Math.round(amount).toLocaleString()}`;

    // Helper to format date
    const formatDate = (dateString: Date | string) => {
        const d = new Date(dateString);
        return d.toLocaleString('en-US', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    };

    // Calculate totals - prioritize the breakdown from the backend
    const items = order.order_items || [];
    const breakdown = order.breakdown || {};

    // Subtotal from items if breakdown.subtotal is missing
    const subtotal = breakdown.subtotal !== undefined
        ? Number(breakdown.subtotal)
        : items.reduce((acc, item) => acc + (Number(item.unit_price) * item.quantity), 0);

    const tax = breakdown.tax !== undefined ? Number(breakdown.tax) : Number(order.tax || 0);
    const serviceCharge = breakdown.serviceCharge !== undefined ? Number(breakdown.serviceCharge) : Number(order.service_charge || 0);
    const deliveryFee = breakdown.deliveryFee !== undefined ? Number(breakdown.deliveryFee) : Number(order.delivery_fee || 0);
    const discount = breakdown.discount !== undefined ? Number(breakdown.discount) : Number(order.discount || 0);
    const total = breakdown.total !== undefined ? Number(breakdown.total) :
                breakdown.grandTotal !== undefined ? Number(breakdown.grandTotal) :
                Number(order.total || (subtotal + tax + serviceCharge + deliveryFee - discount));

    const isPaid = order.payment_status === 'PAID' || order.status === 'CLOSED';
    const isFBRSynced = order.fbr_sync_status === 'SYNCED';
    const isExempt = order.is_tax_exempt === true;

    // ── Determine Settlement Data Availability ───────────────────────────────
    // Only show Settlement block if actual payment data exists
    const paidTransactions = (order.transactions || []).filter(t => t.status === 'PAID');
    const hasTransactions = paidTransactions.length > 0;
    const hasPaymentBreakdown = ((breakdown as any)?.paymentBreakdown?.length ?? 0) > 0;
    // Single payment_method is valid only if the order is actually paid
    const hasSingleMethod = !!order.payment_method && isPaid;
    const hasSettlementData = hasTransactions || hasPaymentBreakdown || hasSingleMethod;

    // Customer name (resolves from multiple possible fields)
    const customerName = order.customer_name || (order as any).customerName || '';
    const customerPhone = order.customer_phone || (order as any).customerPhone || '';

    // Invoice title
    const invoiceTitle = isExempt
        ? 'TAX EXEMPT INVOICE'
        : isFBRSynced
            ? 'FBR TAX INVOICE'
            : isPaid
                ? 'TAX INVOICE'
                : 'PROFORMA INVOICE';

    // Helper: display label for payment method
    const methodLabel = (method: string, name?: string) => {
        if (method === 'CREDIT') {
            return name ? `KHATA (A/C) — ${name}` : 'KHATA (A/C)';
        }
        return method;
    };

    return (
        <div
            className="bg-white text-black font-mono text-[12px] leading-tight p-6 mx-auto relative receipt-paper"
            style={{
                width: width,
                fontFamily: "'Courier New', Courier, monospace",
                color: '#000'
            }}
        >
            {/* Header */}
            <div className="text-center mb-6 border-b-2 border-black pb-4">
                <h1 className="text-2xl font-black uppercase tracking-tighter mb-1">{config.receipt_header_1 || config.business_name || order.restaurants?.name || 'FIREFLOW POS'}</h1>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                    {order.restaurants?.type?.replace('_', ' ') || 'RESTAURANT'}
                </p>
                <div className="mt-2 text-[10px] leading-relaxed">
                    <p>{config.receipt_header_2 || config.business_address || order.restaurants?.address || 'DHA Phase 6, Main Boulevard'}</p>
                    <p>{config.business_phone || order.restaurants?.phone || 'Lahore, Pakistan'}</p>
                    {(config.ntn_number || order.restaurants?.ntn) && <p className="font-bold mt-1 text-xs">NTN: {config.ntn_number || order.restaurants?.ntn}</p>}
                    {(config.strn_number) && <p className="font-bold mt-1 text-xs">STRN: {config.strn_number}</p>}
                    {order.restaurants?.fbr_pos_id && <p className="font-bold text-[9px] text-slate-500 mt-1 uppercase">FBR POS ID: {order.restaurants?.fbr_pos_id}</p>}
                </div>
            </div>

            {/* Invoice State */}
            <div className="text-center mb-4">
                <span className="border-2 border-black px-4 py-1 font-black text-sm uppercase tracking-widest">
                    {invoiceTitle}
                </span>
            </div>

            {/* Meta Data */}
            <div className="grid grid-cols-2 gap-y-1 text-[10px] mb-4">
                <div className="flex flex-col">
                    <span className="text-slate-500 font-bold uppercase">Date</span>
                    <span className="font-bold">{formatDate(order.created_at || new Date())}</span>
                </div>
                <div className="flex flex-col text-right">
                    <span className="text-slate-500 font-bold uppercase">Order #</span>
                    <span className="font-bold text-sm tracking-tighter">{order.order_number || order.id.slice(-6).toUpperCase()}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-slate-500 font-bold uppercase">Type</span>
                    <span className="font-bold">{order.type}</span>
                </div>
                {order.table?.name && (
                    <div className="flex flex-col text-right">
                        <span className="text-slate-500 font-bold uppercase">Table</span>
                        <span className="font-bold">{order.table.name}</span>
                    </div>
                )}
            </div>

            {/* Customer Info — show for named customers OR credit sales */}
            {(customerName || order.payment_method === 'CREDIT') && (
                <div className="border-y border-black border-dashed py-2 mb-4 bg-slate-50">
                    <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">
                        {order.payment_method === 'CREDIT' ? 'Credit Account' : 'Guest Details'}
                    </p>
                    {customerName && <p className="font-bold text-[11px]">{customerName}</p>}
                    {customerPhone && <p className="text-[10px]">{customerPhone}</p>}
                    {order.delivery_address && <p className="text-[9px] mt-1 italic">{order.delivery_address}</p>}
                    {order.payment_method === 'CREDIT' && !customerName && (
                        <p className="text-[10px] italic text-slate-500">Charged to Account</p>
                    )}
                </div>
            )}

            {/* Items Header */}
            <div className="grid grid-cols-12 gap-1 mb-2 font-black text-[10px] uppercase border-b border-black pb-1">
                <div className="col-span-1">QTY</div>
                <div className="col-span-8">DESCRIPTION</div>
                <div className="col-span-3 text-right">AMOUNT</div>
            </div>

            {/* Items List */}
            <div className="space-y-3 mb-6">
                {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1 text-[11px] items-start">
                        <div className="col-span-1 font-black">{item.quantity}x</div>
                        <div className="col-span-8">
                            <div className="font-black uppercase tracking-tighter leading-none">{item.menu_item?.name || item.item_name || 'Unknown Item'}</div>
                            {item.notes && <div className="text-[9px] italic mt-1 bg-slate-100 py-0.5 px-1 pr-2 inline-block -ml-1">* {item.notes}</div>}
                        </div>
                        <div className="col-span-3 text-right font-bold">
                            {formatCurrency(Number(item.unit_price) * item.quantity)}
                        </div>
                    </div>
                ))}
            </div>

            {/* Summary Section */}
            <div className="space-y-1.5 border-t-2 border-black pt-4">
                <div className="flex justify-between text-[11px]">
                    <span className="font-bold text-slate-600">
                        {order.tax_type === 'INCLUSIVE' ? 'TOTAL (TAX INCLUDED)' : 'GROSS SUBTOTAL'}
                    </span>
                    <span className="font-bold">{formatCurrency(subtotal)}</span>
                </div>

                {discount > 0 && (
                    <div className="flex justify-between text-[11px] text-red-600 font-bold italic">
                        <span>DISCOUNT {breakdown.discountReason ? `(${breakdown.discountReason})` : '(-)'}</span>
                        <span>{formatCurrency(discount)}</span>
                    </div>
                )}

                {/* Service Charge - Only if Dine In */}
                {order.type === 'DINE_IN' && serviceCharge > 0 && (
                    <div className="flex justify-between text-[11px]">
                        <span className="font-bold uppercase">Service Charge ({order.service_charge_rate || config.service_charge_rate || 5}%)</span>
                        <span className="font-bold">{formatCurrency(serviceCharge)}</span>
                    </div>
                )}

                {/* Tax Logic: Hide if exempt, show as component if inclusive, show as addition if exclusive */}
                {!order.is_tax_exempt && tax > 0 && (
                    <div className="flex justify-between text-[11px]">
                        <span className="font-bold tracking-widest">
                            {config.tax_label || (order.tax_type === 'INCLUSIVE' ? 'INCL. TAX (GST 16%)' : 'GST (16%)')}
                        </span>
                        <span className="font-bold italic">
                            {order.tax_type === 'INCLUSIVE' ? `[${formatCurrency(tax)}]` : formatCurrency(tax)}
                        </span>
                    </div>
                )}

                {order.is_tax_exempt && (
                    <div className="text-[9px] font-black uppercase tracking-widest text-center border border-black py-1 my-1">
                        *** TAX EXEMPTED ***
                    </div>
                )}

                {order.type === 'DELIVERY' && deliveryFee > 0 && (
                    <div className="flex justify-between text-[11px]">
                        <span className="font-bold">DELIVERY FEE</span>
                        <span className="font-bold">{formatCurrency(deliveryFee)}</span>
                    </div>
                )}

                {/* Grand Total */}
                <div className="flex justify-between items-baseline mt-4 pt-3 border-t-4 border-double border-black">
                    <span className="text-xl font-black italic tracking-tighter">NET PAYABLE:</span>
                    <span className="text-2xl font-black italic tracking-tighter underline">
                        {formatCurrency(total)}
                    </span>
                </div>
            </div>

            {/* Settlement Details — ONLY shown when actual payment data exists */}
            {hasSettlementData && (
                <div className="mt-4 p-2 border border-black bg-slate-50 uppercase font-black text-[10px] tracking-widest leading-relaxed">
                    <p className="border-b border-black pb-1 mb-1 text-center italic">Settlement Details</p>

                    {hasTransactions ? (
                        /* Priority 1: Actual paid transactions from DB */
                        paidTransactions.map((t, i) => (
                            <div key={i} className="mb-1">
                                <div className="flex justify-between px-2">
                                    <span>
                                        {methodLabel(
                                            t.payment_method,
                                            t.payment_method === 'CREDIT' ? customerName : undefined
                                        )}:
                                    </span>
                                    <span>{formatCurrency(Number(t.amount))}</span>
                                </div>
                                {/* Cash Details: Tendered and Change */}
                                {t.payment_method === 'CASH' && (t.tenderedAmount || t.changeGiven) && (
                                    <div className="px-4 text-[9px] opacity-70 italic lowercase">
                                        <div className="flex justify-between">
                                            <span>- received:</span>
                                            <span>{formatCurrency(Number(t.tenderedAmount || t.amount))}</span>
                                        </div>
                                        {(t.changeGiven || 0) > 0 && (
                                            <div className="flex justify-between">
                                                <span>- change:</span>
                                                <span>{formatCurrency(Number(t.changeGiven))}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    ) : hasPaymentBreakdown ? (
                        /* Priority 2: Payment breakdown from PaymentModal (live preview / Settle & Print) */
                        ((breakdown as any).paymentBreakdown as { method: string; amount: number }[]).map((p, i) => (
                            <div key={i} className="flex justify-between px-2 mb-1">
                                <span>
                                    {methodLabel(
                                        p.method,
                                        p.method === 'CREDIT' ? customerName : undefined
                                    )}:
                                </span>
                                <span>{formatCurrency(p.amount)}</span>
                            </div>
                        ))
                    ) : (
                        /* Priority 3: Single payment_method field (only when order is paid) */
                        <div className="flex justify-between px-2">
                            <span>
                                {methodLabel(order.payment_method || 'CASH', customerName || undefined)}:
                            </span>
                            <span>{formatCurrency(total)}</span>
                        </div>
                    )}

                    {isPaid && <p className="text-center mt-2 border-t border-black pt-1">*** FULLY PAID ***</p>}
                </div>
            )}

            {/* Footer */}
            <div className="mt-8 text-center space-y-2">
                <p className="text-[10px] italic">*** {config.receipt_footer || 'Thank You!'} ***</p>
                <p className="text-[9px]">
                    {order.restaurants?.name ? `${order.restaurants.name} | ` : ''}Powered by Fireflow POS
                </p>

                {/* FBR QR Code Block - shown only when FBR synced */}
                {isFBRSynced && (
                    <div className="mt-4 border border-dashed border-black p-3">
                        <p className="text-[8px] font-black uppercase tracking-widest mb-2">FBR Verification QR</p>
                        <div className="w-20 h-20 bg-black/10 mx-auto flex items-center justify-center text-[7px] text-slate-400 font-mono">
                            {order.fbr_qr_code ? (
                                <img src={order.fbr_qr_code} alt="FBR QR" className="w-full h-full object-contain" />
                            ) : (
                                '[QR CODE]'
                            )}
                        </div>
                        {order.order_number && (
                            <p className="text-[8px] mt-1 font-mono tracking-tight">{order.order_number}</p>
                        )}
                    </div>
                )}

                {/* Real Barcode for Scanning */}
                {order.order_number && (
                    <div className="mt-4 text-center">
                        <style>
                            {`@import url('https://fonts.googleapis.com/css2?family=Libre+Barcode+128&display=swap');`}
                        </style>
                        <div
                            style={{ fontFamily: "'Libre Barcode 128', sans-serif", fontSize: '48px', lineHeight: '48px' }}
                        >
                            {order.order_number}
                        </div>
                        <div className="text-[8px] font-mono tracking-widest">{order.order_number}</div>
                    </div>
                )}
            </div>

            {/* Paper tear effect at bottom */}
            <div
                className="absolute left-0 bottom-[-10px] w-full h-[10px] bg-transparent"
                style={{
                    backgroundImage: 'radial-gradient(circle, transparent 50%, #fff 50%)',
                    backgroundSize: '10px 10px',
                    backgroundPosition: '0 -5px'
                }}
            />
        </div>
    );
};
