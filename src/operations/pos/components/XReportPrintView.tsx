import React from 'react';

interface XReportPrintViewProps {
    session: any;
    restaurantName: string;
}

export const XReportPrintView: React.FC<XReportPrintViewProps> = ({ session, restaurantName }) => {
    if (!session || !session.calculatedSummary) return null;
    const summary = session.calculatedSummary;
    const fmt = (val: number) => `Rs. ${Number(val || 0).toLocaleString('en-PK')}`;

    return (
        <div className="hidden print:block w-[210mm] min-h-[297mm] p-8 bg-white text-black font-sans text-sm mx-auto">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold uppercase">{restaurantName}</h1>
                <h2 className="text-xl font-semibold mt-2">X-Report (Shift Summary)</h2>
                <p className="text-gray-600 mt-1">Shift ID: {session.id}</p>
                <p className="text-gray-600">Opened: {new Date(session.opened_at).toLocaleString()}</p>
                {session.closed_at && <p className="text-gray-600">Closed: {new Date(session.closed_at).toLocaleString()}</p>}
                <p className="text-gray-600">Cashier: {session.staff_cashier_sessions_opened_byTostaff?.name || 'Unknown'}</p>
            </div>

            <div className="grid grid-cols-2 gap-12 mb-8">
                {/* Sales Breakdown */}
                <div>
                    <h3 className="text-lg font-bold border-b-2 border-black mb-3 pb-1">Sales Breakdown</h3>
                    <div className="flex justify-between mb-1"><span>Dine-In Sales</span><span>{fmt(summary.dineInSales)}</span></div>
                    <div className="flex justify-between mb-1"><span>Takeaway Sales</span><span>{fmt(summary.takeawaySales)}</span></div>
                    <div className="flex justify-between mb-1"><span>Delivery Sales</span><span>{fmt(summary.deliverySales)}</span></div>
                    <div className="flex justify-between font-bold mt-2 pt-2 border-t border-gray-300">
                        <span>Total Gross Sales</span><span>{fmt(summary.totalSales)}</span>
                    </div>
                </div>

                {/* Taxes & Charges */}
                <div>
                    <h3 className="text-lg font-bold border-b-2 border-black mb-3 pb-1">Taxes & Charges</h3>
                    <div className="flex justify-between mb-1"><span>Tax Collected</span><span>{fmt(summary.taxCollected)}</span></div>
                    <div className="flex justify-between mb-1"><span>Service Charge</span><span>{fmt(summary.serviceChargeCollected)}</span></div>
                    <div className="flex justify-between mb-1 text-red-600"><span>Discounts Given</span><span>-{fmt(summary.discountGiven)}</span></div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-12 mb-8">
                {/* Payment Methods */}
                <div>
                    <h3 className="text-lg font-bold border-b-2 border-black mb-3 pb-1">Payment Methods</h3>
                    <div className="flex justify-between mb-1"><span>Cash</span><span>{fmt(summary.cashSales)}</span></div>
                    <div className="flex justify-between mb-1"><span>Card</span><span>{fmt(summary.cardSales)}</span></div>
                    <div className="flex justify-between mb-1"><span>Raast/Transfer</span><span>{fmt(summary.raastSales)}</span></div>
                    <div className="flex justify-between mb-1"><span>Credit (Khata)</span><span>{fmt(summary.creditSales)}</span></div>
                </div>

                {/* Cash Flow */}
                <div>
                    <h3 className="text-lg font-bold border-b-2 border-black mb-3 pb-1">Cash Flow</h3>
                    <div className="flex justify-between mb-1"><span>Opening Float</span><span>{fmt(summary.openingFloat)}</span></div>
                    <div className="flex justify-between mb-1"><span>Cash Sales</span><span>{fmt(summary.cashSales)}</span></div>
                    <div className="flex justify-between mb-1"><span>Customer Payments (In)</span><span>{fmt(summary.customerPayments)}</span></div>
                    <div className="flex justify-between mb-1 text-red-600"><span>Payouts (Out)</span><span>-{fmt(summary.payouts)}</span></div>
                    <div className="flex justify-between font-bold mt-2 pt-2 border-t border-gray-300">
                        <span>Theoretical Cash</span>
                        <span>{fmt(summary.openingFloat + summary.cashSales + summary.customerPayments - summary.payouts)}</span>
                    </div>
                </div>
            </div>

            {/* Signature Area */}
            <div className="mt-24 pt-8 border-t border-gray-400 flex justify-between px-12">
                <div className="text-center w-48">
                    <div className="border-b border-black mb-2 h-8"></div>
                    <p className="text-sm">Cashier Signature</p>
                </div>
                <div className="text-center w-48">
                    <div className="border-b border-black mb-2 h-8"></div>
                    <p className="text-sm">Manager Signature</p>
                </div>
            </div>
            
            <div className="mt-12 text-center text-xs text-gray-500">
                Generated by Fireflow POS at {new Date().toLocaleString()}
            </div>
        </div>
    );
};
