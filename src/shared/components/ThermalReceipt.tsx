
import React from 'react';
import { Order } from '../types';

interface ThermalReceiptProps {
    order: Order;
    width?: string; // e.g., '58mm' or '80mm' -> mapped to pixels
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({ order, width = '380px' }) => {
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
    const total = breakdown.grandTotal !== undefined ? Number(breakdown.grandTotal) : Number(order.total || (subtotal + tax + serviceCharge + deliveryFee - discount));

    const isPaid = order.payment_status === 'PAID' || order.status === 'CLOSED';
    const invoiceTitle = isPaid ? "TAX INVOICE" : "PROFORMA INVOICE";

    return (
        <div
            className="bg-white text-black font-mono text-[12px] leading-tight p-6 shadow-lg mx-auto relative receipt-paper"
            style={{
                width: width,
                fontFamily: "'Courier New', Courier, monospace",
                filter: 'grayscale(100%) contrast(1.1)',
                color: '#1a1a1a'
            }}
        >
            {/* Header */}
            <div className="text-center mb-6 border-b-2 border-black pb-4">
                <h1 className="text-2xl font-black uppercase tracking-tighter mb-1">AORA PREMIUM</h1>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Culinary Excellence</p>
                <div className="mt-2 text-[10px] leading-relaxed">
                    <p>DHA Phase 6, Main Boulevard</p>
                    <p>Lahore, Pakistan</p>
                    <p>Tel: +92-300-FIREFLOW</p>
                    <p className="font-bold mt-1">NTN: 1234567-8</p>
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

            {/* Customer Info */}
            {(order.customer_name || order.customerName) && (
                <div className="border-y border-black border-dashed py-2 mb-4 bg-slate-50">
                    <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Guest Details</p>
                    <p className="font-bold text-[11px]">{order.customer_name || order.customerName}</p>
                    {order.customer_phone && <p className="text-[10px]">{order.customer_phone}</p>}
                    {order.delivery_address && <p className="text-[9px] mt-1 italic">{order.delivery_address}</p>}
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
                    <span className="font-bold text-slate-600">GROSS SUBTOTAL</span>
                    <span className="font-bold">{formatCurrency(subtotal)}</span>
                </div>

                {discount > 0 && (
                    <div className="flex justify-between text-[11px] text-red-600 font-bold italic">
                        <span>PROMO DISCOUNT (-)</span>
                        <span>{formatCurrency(discount)}</span>
                    </div>
                )}

                {serviceCharge > 0 && (
                    <div className="flex justify-between text-[11px]">
                        <span className="font-bold">SERVICE CHARGE ({order.restaurants?.service_charge_rate || 5}%)</span>
                        <span className="font-bold">{formatCurrency(serviceCharge)}</span>
                    </div>
                )}

                {tax > 0 && (
                    <div className="flex justify-between text-[11px]">
                        <span className="font-bold tracking-widest">GST ({order.restaurants?.tax_rate || 16}%)</span>
                        <span className="font-bold">{formatCurrency(tax)}</span>
                    </div>
                )}

                {deliveryFee > 0 && (
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

            {/* Payment Info */}
            {isPaid && (
                <div className="mt-4 p-2 border border-black bg-slate-50 text-center uppercase font-black text-[10px] tracking-widest">
                    PAID VIA {order.payment_method || 'CASH'}
                </div>
            )}

            {/* Footer */}
            <div className="mt-8 text-center space-y-2">
                <p className="text-[10px] italic">*** Thank You! ***</p>
                <p className="text-[9px]">Powered by Fireflow POS</p>
                {/* Barcode placeholder */}
                <div className="mt-4 h-8 bg-black/10 flex items-center justify-center text-[8px] tracking-[0.5em] uppercase">
                    ||| || ||| || |||
                </div>
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
