
import React from 'react';
import { Order, OrderItem, PaymentBreakdown, Transaction } from '../../shared/types';

interface ReceiptViewProps {
  order: Order;
  breakdown: PaymentBreakdown;
  transaction?: Transaction;
  invoiceSettings?: any;
  isProforma?: boolean;
}

export const ReceiptView: React.FC<ReceiptViewProps> = ({
  order,
  breakdown,
  transaction,
  invoiceSettings = {},
  isProforma = false
}) => {
  const formatDate = (date: any) => {
    return new Date(date).toLocaleString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatCurrency = (amount: number) => {
    return `Rs. ${Math.round(amount).toLocaleString()}`;
  };

  return (
    <div id="receipt-print-area" className="receipt-view bg-white text-black p-4 mx-auto font-mono text-[12px] leading-tight print:block hidden">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #receipt-print-area, #receipt-print-area * {
            visibility: visible !important;
          }
          #receipt-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 65mm !important;
            padding: 2mm !important;
            margin: 0 !important;
            background: white !important;
            color: black !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }
          @page {
            size: 80mm auto;
            margin: 0;
          }
        }
        .receipt-view {
          width: 65mm;
          min-height: 100mm;
          box-sizing: border-box;
          font-family: 'Courier New', Courier, monospace;
          background: white;
          overflow: hidden;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
        .border-b { border-bottom: 1px dashed #000; }
        .border-t { border-top: 1px dashed #000; }
        .my-2 { margin-top: 0.5rem; margin-bottom: 0.5rem; }
        .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
        .flex { display: flex; }
        .justify-between { justify-content: space-between; }
        .uppercase { text-transform: uppercase; }
        .text-lg { font-size: 1.125rem; }
        .text-xl { font-size: 1.25rem; }
        .italic { font-style: italic; }
      `}</style>

      {/* Header */}
      <div className="text-center mb-4">
        <h1 className="text-xl font-bold uppercase">{invoiceSettings.business_name || order.restaurants?.name || 'FIREFLOW RESTAURANT'}</h1>
        <p className="text-[10px]">{invoiceSettings.business_address || order.restaurants?.address || 'Main Branch, City'}</p>
        <p className="text-[10px]">Phone: {invoiceSettings.business_phone || order.restaurants?.phone || '000-0000000'}</p>
        {invoiceSettings.tax_id && <p className="text-[10px]">NTN/Tax ID: {invoiceSettings.tax_id}</p>}
      </div>

      <div className="text-center my-2 py-1 border-t border-b font-bold tracking-widest uppercase">
        {isProforma ? '*** PROFORMA / PRE-BILL ***' : 'TAX INVOICE'}
      </div>

      {/* Order Info */}
      <div className="my-2 text-[10px]">
        <div className="flex justify-between">
          <span>Date: {formatDate(order.created_at || new Date())}</span>
          <span>Order: #{order.id.slice(-6).toUpperCase()}</span>
        </div>
        <div className="flex justify-between">
          <span>Type: {order.type}</span>
          {order.table?.name && <span>Table: {order.table.name}</span>}
        </div>
        {invoiceSettings.print_cashier_name && order.last_action_by && (
          <div className="flex justify-between">
            <span>Cashier: {order.last_action_by.slice(0, 10)}</span>
          </div>
        )}
      </div>

      {/* Items Section */}
      <div className="border-t border-b py-1 font-bold text-[10px] flex justify-between uppercase">
        <span className="w-[10%]">Qty</span>
        <span className="w-[60%]">Description</span>
        <span className="w-[30%] text-right">Price</span>
      </div>

      <div className="my-2 border-b pb-2">
        {order.order_items?.map((item: OrderItem, idx: number) => (
          <div key={idx} className="flex justify-between my-1">
            <span className="w-[10%]">{item.quantity}</span>
            <div className="w-[60%]">
              <span className="uppercase">{item.item_name}</span>
              {item.notes && <p className="text-[9px] italic ml-2">* {item.notes}</p>}
            </div>
            <span className="w-[30%] text-right">{formatCurrency(item.total_price)}</span>
          </div>
        ))}
      </div>

      {/* Totals Section */}
      <div className="space-y-1 my-2 border-b pb-2">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(breakdown.subtotal)}</span>
        </div>

        {breakdown.discount > 0 && (
          <div className="flex justify-between italic text-[10px]">
            <span>Discount {breakdown.discountPercent! > 0 ? `(${breakdown.discountPercent}%)` : ''} {order.breakdown?.discountReason ? `- ${order.breakdown.discountReason}` : ''}</span>
            <span>-{formatCurrency(breakdown.discount)}</span>
          </div>
        )}

        {breakdown.serviceCharge > 0 && (
          <div className="flex justify-between">
            <span>Service Charge</span>
            <span>{formatCurrency(breakdown.serviceCharge)}</span>
          </div>
        )}

        {breakdown.tax > 0 && (
          <>
            <div className="flex justify-between">
              <span>{invoiceSettings.tax_label || 'Tax'}</span>
              <span>{formatCurrency(breakdown.tax)}</span>
            </div>
            {breakdown.taxExemptAmount! > 0 && (
                <div className="text-[8px] text-right italic -mt-1 lowercase">
                    *incl. {formatCurrency(breakdown.taxExemptAmount!)} exampted items.
                </div>
            )}
          </>
        )}

        {breakdown.deliveryFee > 0 && (
          <div className="flex justify-between">
            <span>Delivery Fee</span>
            <span>{formatCurrency(breakdown.deliveryFee)}</span>
          </div>
        )}

        <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
          <span>TOTAL PAYABLE</span>
          <span>{formatCurrency(breakdown.total)}</span>
        </div>
      </div>

      {/* Payment Settlement */}
      {!isProforma && transaction && (
        <div className="my-2 pt-2 border-t text-[10px]">
          <div className="flex justify-between uppercase">
            <span>Paid By: {transaction.payment_method}</span>
            <span>Status: SUCCESS</span>
          </div>
          {transaction.tenderedAmount && (
            <div className="flex justify-between">
              <span>Amount Tendered</span>
              <span>{formatCurrency(transaction.tenderedAmount)}</span>
            </div>
          )}
          {transaction.changeGiven !== undefined && (
            <div className="flex justify-between font-bold">
              <span>Change</span>
              <span>{formatCurrency(transaction.changeGiven)}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-6 pt-4 border-t border-dashed">
        <p className="text-[10px] italic">{invoiceSettings.receipt_footer || 'Thank you for dining with us!'}</p>
        {invoiceSettings.receipt_wifi_password && (
            <p className="text-[9px] mt-1 font-bold uppercase tracking-widest">WiFi: {invoiceSettings.receipt_wifi_password}</p>
        )}
        <p className="text-[8px] mt-2 opacity-50">FireFlow POS - Powered by Advanced Agentic Coding</p>
        {isProforma && <p className="text-[8px] mt-1 font-bold">*** NOT A TAX INVOICE ***</p>}
      </div>
    </div>
  );
};
