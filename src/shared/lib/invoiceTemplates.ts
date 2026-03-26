
/**
 * Fireflow POS - Thermal Invoice Templates Utility
 * Generates isolated HTML/CSS for 80mm thermal printers
 */

interface TemplateData {
    config: any;
    order: any;
    items: any[];
    breakdown: any;
    isPaid: boolean;
    paymentMethod: string;
    customer?: any;
}

export const generateInvoiceHtml = (templateId: string, data: TemplateData): string => {
    const { config, order, items, breakdown, isPaid, paymentMethod, customer } = data;
    
    const businessName = config.businessName || config.business_name || 'FIREFLOW POS';
    const businessAddress = config.businessAddress || config.business_address || '';
    const businessPhone = config.businessPhone || config.business_phone || '';
    const ntn = config.ntnNumber || '';
    const taxLabel = config.taxLabel || config.tax_label || 'GST';
    const footerText = config.receiptFooterText || config.receipt_footer || 'Thank you for your business!';
    
    const orderNum = order.order_number || order.id?.slice(-8).toUpperCase() || 'N/A';
    const dateStr = new Date(order.created_at || Date.now()).toLocaleString('en-PK', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });

    const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;

    // Item rows generation
    const itemRows = items.map(item => `
        <tr>
            <td style="width:10%; vertical-align:top;">${item.quantity}</td>
            <td style="width:60%; vertical-align:top; text-transform:uppercase;">${item.item_name || item.menu_item?.name || 'Item'}</td>
            <td style="width:30%; vertical-align:top; text-align:right;">${fmt((item.unit_price || 0) * item.quantity)}</td>
        </tr>
    `).join('');

    // Credit Section (Khata)
    const creditSection = (paymentMethod === 'CREDIT' || paymentMethod === 'KHATA') ? `
        <div style="margin-top: 10px; border: 1px solid #000; padding: 5px;">
            <div style="font-weight: 900; text-align: center; text-transform: uppercase; font-size: 11px; margin-bottom: 4px;">Credit Account Details</div>
            <div style="display: flex; justify-content: space-between; font-size: 10px;">
                <span>Customer:</span>
                <span style="font-weight: bold;">${customer?.name || order.customer_name || 'Guest'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 10px;">
                <span>Phone:</span>
                <span>${customer?.phone || order.customer_phone || 'N/A'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 4px; border-top: 1px solid #eee; pt: 2px;">
                <span>Previous Bal:</span>
                <span>${fmt(Number(customer?.balance || 0))}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold;">
                <span>Current Bill:</span>
                <span>${fmt(breakdown.total)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; border-top: 1px double #000; margin-top: 2px;">
                <span>New Balance:</span>
                <span>${fmt(Number(customer?.balance || 0) + breakdown.total)}</span>
            </div>
            <div style="margin-top: 20px; border-top: 1px solid #000; text-align: center; font-size: 8px; padding-top: 2px;">
                CUSTOMER SIGNATURE
            </div>
        </div>
    ` : '';

    // Base CSS for all templates
    const baseCss = `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #ffffff !important; color: #000000 !important; font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.3; }
        .receipt { width: 72mm; padding: 2mm 2mm; background: #ffffff; margin: 0 auto; }
        .dashed { border-top: 1px dashed #000; margin: 5px 0; }
        .thick { border-top: 2px solid #000; margin: 5px 0; }
        table { width: 100%; border-collapse: collapse; margin: 5px 0; }
        th { text-align: left; border-bottom: 1px solid #000; padding-bottom: 2px; font-size: 10px; }
        td { padding: 2px 0; font-size: 10px; }
        .flex-between { display: flex; justify-content: space-between; }
        .text-center { text-align: center; }
        .bold { font-weight: bold; }
        .extra-bold { font-weight: 900; }
        .uppercase { text-transform: uppercase; }
        @page { size: 80mm auto; margin: 0; }
    `;

    // Template specific layouts
    switch (templateId) {
        case 'modern':
            return `
                <html>
                <head><style>${baseCss} body { font-family: 'Inter', sans-serif; font-size: 10px; } .header-name { font-size: 16px; font-weight: 900; letter-spacing: -0.5px; }</style></head>
                <body>
                    <div class="receipt">
                        <div class="text-center">
                            <div class="header-name uppercase">${businessName}</div>
                            <div style="font-size: 9px; opacity: 0.8;">${businessAddress}</div>
                            <div style="font-size: 9px;">${businessPhone}</div>
                        </div>
                        <div class="dashed"></div>
                        <div class="flex-between"><span>#${orderNum}</span><span class="bold">${order.type}</span></div>
                        <div class="flex-between"><span>${dateStr}</span><span>${order.table?.name || ''}</span></div>
                        <div class="thick"></div>
                        <table>
                            <thead><tr><th>QTY</th><th>ITEM</th><th style="text-align:right;">AMT</th></tr></thead>
                            <tbody>${itemRows}</tbody>
                        </table>
                        <div class="dashed"></div>
                        <div class="flex-between"><span>SUBTOTAL</span><span>${fmt(breakdown.subtotal)}</span></div>
                        ${breakdown.discount > 0 ? `<div class="flex-between"><span>DISCOUNT</span><span>-${fmt(breakdown.discount)}</span></div>` : ''}
                        ${breakdown.tax > 0 ? `<div class="flex-between"><span>${taxLabel}</span><span>${fmt(breakdown.tax)}</span></div>` : ''}
                        <div class="flex-between bold" style="font-size: 14px; margin-top: 5px;"><span>TOTAL</span><span>${fmt(breakdown.total)}</span></div>
                        ${isPaid ? `<div class="text-center bold" style="border: 1px solid #000; margin-top: 10px; padding: 4px;">PAID - ${paymentMethod}</div>` : ''}
                        ${creditSection}
                        <div class="text-center" style="margin-top: 15px; font-size: 9px;">${footerText}</div>
                        <div class="text-center" style="font-[7px]; opacity: 0.5; margin-top: 5px;">Powered by Fireflow</div>
                    </div>
                </body>
                </html>
            `;

        case 'minimal':
            return `
                <html>
                <head><style>${baseCss} .receipt { padding: 4mm; }</style></head>
                <body>
                    <div class="receipt">
                        <h1 class="text-center uppercase" style="font-size: 14px;">${businessName}</h1>
                        <p class="text-center" style="font-size: 9px; margin-bottom: 10px;">${businessAddress}</p>
                        <div class="flex-between" style="font-size: 9px;"><span>${orderNum}</span><span>${dateStr}</span></div>
                        <div class="dashed" style="border-top-style: dotted;"></div>
                        <table>
                            <tbody>${itemRows}</tbody>
                        </table>
                        <div class="dashed" style="border-top-style: dotted;"></div>
                        <div class="flex-between"><span>Total</span><span class="bold">${fmt(breakdown.total)}</span></div>
                        ${isPaid ? `<p class="text-center" style="margin-top: 10px;">*** ${paymentMethod} ***</p>` : ''}
                        ${creditSection}
                        <p class="text-center" style="margin-top: 15px; font-size: 9px;">${footerText}</p>
                    </div>
                </body>
                </html>
            `;

        case 'urdu-optimized':
            return `
                <html>
                <head><style>${baseCss} .urdu { font-family: 'Noto Nastaliq Urdu', serif; direction: rtl; text-align: right; }</style></head>
                <body>
                    <div class="receipt">
                        <h1 class="text-center">${businessName}</h1>
                        <div class="text-center" style="font-size: 9px;">${businessAddress}</div>
                        <div class="dashed"></div>
                        <div class="flex-between uppercase bold"><span>${orderNum}</span><span>${order.type}</span></div>
                        <div class="flex-between"><span>Date:</span><span>${dateStr}</span></div>
                        <div class="thick"></div>
                        <table>
                            <thead><tr><th>Qty</th><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
                            <tbody>${itemRows}</tbody>
                        </table>
                        <div class="dashed"></div>
                        <div class="flex-between extra-bold" style="font-size: 14px;"><span>NET TOTAL</span><span>${fmt(breakdown.total)}</span></div>
                        ${creditSection}
                        <div class="text-center" style="margin-top: 20px;">${footerText}</div>
                        <div class="urdu text-center" style="margin-top: 5px;">تشریف آوری کا شکریہ</div>
                    </div>
                </body>
                </html>
            `;

        case 'classic':
        default:
            return `
                <html>
                <head><style>${baseCss}</style></head>
                <body>
                    <div class="receipt">
                        <h1 class="text-center extra-bold" style="font-size: 18px; letter-spacing: 1px;">${businessName}</h1>
                        <div class="text-center" style="font-size: 10px; margin-bottom: 5px;">${businessAddress}</div>
                        ${businessPhone ? `<div class="text-center">Tel: ${businessPhone}</div>` : ''}
                        ${ntn ? `<div class="text-center">NTN: ${ntn}</div>` : ''}
                        <div class="thick"></div>
                        <div class="text-center extra-bold" style="font-size: 12px; margin: 5px 0;">${isPaid ? 'CASH RECEIPT' : 'GUEST BILL'}</div>
                        <div class="dashed"></div>
                        <div class="meta">
                            <div class="flex-between"><span>DATE:</span><span>${dateStr}</span></div>
                            <div class="flex-between"><span>ORDER:</span><span>${orderNum}</span></div>
                            <div class="flex-between"><span>TYPE:</span><span>${order.type}</span></div>
                            ${order.table ? `<div class="flex-between"><span>TABLE:</span><span>${order.table.name}</span></div>` : ''}
                        </div>
                        <div class="dashed"></div>
                        <table>
                            <thead><tr><th>QTY</th><th>DESCRIPTION</th><th style="text-align:right;">PRICE</th></tr></thead>
                            <tbody>${itemRows}</tbody>
                        </table>
                        <div class="dashed"></div>
                        <div class="totals" style="padding-left: 20mm;">
                            <div class="flex-between"><span>SUBTOTAL:</span><span>${fmt(breakdown.subtotal)}</span></div>
                            ${breakdown.discount > 0 ? `<div class="flex-between"><span>DISCOUNT:</span><span>-${fmt(breakdown.discount)}</span></div>` : ''}
                            ${breakdown.tax > 0 ? `<div class="flex-between"><span>${taxLabel}:</span><span>${fmt(breakdown.tax)}</span></div>` : ''}
                            ${breakdown.serviceCharge > 0 ? `<div class="flex-between"><span>S. CHARGE:</span><span>${fmt(breakdown.serviceCharge)}</span></div>` : ''}
                            ${breakdown.deliveryFee > 0 ? `<div class="flex-between"><span>DELIVERY:</span><span>${fmt(breakdown.deliveryFee)}</span></div>` : ''}
                        </div>
                        <div class="thick"></div>
                        <div class="flex-between extra-bold" style="font-size: 15px;"><span>TOTAL:</span><span>${fmt(breakdown.total)}</span></div>
                        <div class="thick"></div>
                        ${isPaid ? `<div class="text-center extra-bold" style="font-size: 12px; margin: 10px 0; border: 2px solid #000; padding: 5px;">*** PAID — ${paymentMethod} ***</div>` : ''}
                        ${creditSection}
                        <div class="text-center" style="margin-top: 15px;">${footerText}</div>
                        <div class="text-center" style="font-size: 8px; margin-top: 10px;">SOFTWARE BY FIREFLOW POS</div>
                    </div>
                </body>
                </html>
            `;
    }
};
