
/**
 * reportTemplates.ts
 * Generates professional, printable HTML layouts for Financial Reports.
 */

export function renderReport(title: string, data: any, type: string): string {
    const formattedDate = new Date().toLocaleString();
    const start = data.period?.start ? new Date(data.period.start).toLocaleDateString() : 'N/A';
    const end = data.period?.end ? new Date(data.period.end).toLocaleDateString() : 'N/A';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | FireFlow Reports</title>
    <style>
        :root {
            --primary: #0f172a;
            --secondary: #64748b;
            --accent: #f59e0b;
            --border: #e2e8f0;
            --bg: #f8fafc;
        }
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
            margin: 0; 
            padding: 40px; 
            color: var(--primary);
            background: white;
            line-height: 1.5;
        }
        .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start;
            border-bottom: 2px solid var(--primary);
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
        .header .meta { text-align: right; font-size: 12px; color: var(--secondary); }
        
        .report-info {
            background: var(--bg);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 30px;
            display: flex;
            gap: 40px;
            font-size: 14px;
        }
        .info-item b { color: var(--secondary); text-transform: uppercase; font-size: 11px; display: block; }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .summary-card {
            border: 1px solid var(--border);
            padding: 15px;
            border-radius: 8px;
            text-align: center;
        }
        .summary-card .label { font-size: 11px; color: var(--secondary); text-transform: uppercase; font-weight: bold; }
        .summary-card .value { font-size: 20px; font-weight: 800; margin-top: 5px; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { text-align: left; padding: 12px; border-bottom: 2px solid var(--border); font-size: 12px; text-transform: uppercase; color: var(--secondary); }
        td { padding: 12px; border-bottom: 1px solid var(--border); font-size: 13px; }
        tr:nth-child(even) { background: #fafafa; }
        
        .footer { margin-top: 50px; text-align: center; font-size: 10px; color: var(--secondary); border-top: 1px solid var(--border); padding-top: 20px; }
        
        .negative { color: #ef4444; }
        .positive { color: #22c55e; }
        .badge { padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; }
        .badge-danger { background: #fee2e2; color: #991b1b; }
        .badge-success { background: #dcfce7; color: #166534; }

        @media print {
            body { padding: 0; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>${title}</h1>
            <p style="margin: 5px 0 0 0; color: var(--secondary); font-size: 14px;">Enterprise Financial Management</p>
        </div>
        <div class="meta">
            <div>Generated: ${formattedDate}</div>
            <div style="margin-top: 5px; font-weight: bold; color: var(--primary);">FIREFLOW POS v1.0</div>
        </div>
    </div>

    <div class="report-info">
        <div class="info-item">
            <b>Reporting Period</b>
            ${start} &mdash; ${end}
        </div>
        <div class="info-item">
            <b>Restaurant ID</b>
            ${data.restaurant_id || 'Current Site'}
        </div>
    </div>

    ${renderReportBody(type, data)}

    <div class="footer">
        &copy; ${new Date().getFullYear()} FireFlow Technologies. This is a computer generated document and does not require a signature.
        <br><button class="no-print" onclick="window.print()" style="margin-top: 15px; padding: 8px 20px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">Print Report</button>
    </div>
</body>
</html>
    `;
}

function renderReportBody(type: string, data: any): string {
    switch (type) {
        case 'daily-sales':
            return renderDailySales(data);
        case 'tax-liability':
            return renderTaxLiability(data);
        case 'loss-prevention':
            return renderLossPrevention(data);
        case 'staff-performance':
            return renderStaffPerformance(data);
        case 'category-sales':
            return renderCategorySales(data);
        case 'payment-methods':
            return renderPaymentMethods(data);
        case 'rider-audit':
            return renderRiderAudit(data);
        default:
            return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }
}

function renderCategorySales(data: any): string {
    return `
        <div class="summary-grid">
            <div class="summary-card">
                <div class="label">Total Categories</div>
                <div class="value">${data.summary.total_categories}</div>
            </div>
            <div class="summary-card">
                <div class="label">Total Units Sold</div>
                <div class="value">${data.summary.total_units}</div>
            </div>
            <div class="summary-card">
                <div class="label">Total Revenue</div>
                <div class="value">Rs. ${Math.round(data.summary.total_revenue).toLocaleString()}</div>
            </div>
        </div>

        <h3>Category Revenue Breakdown</h3>
        <table>
            <thead>
                <tr>
                    <th>Category</th>
                    <th>Units</th>
                    <th>Revenue</th>
                    <th>% of Sales</th>
                </tr>
            </thead>
            <tbody>
                ${data.categories.map((c: any) => `
                    <tr>
                        <td>${c.name}</td>
                        <td>${c.quantity}</td>
                        <td>Rs. ${Math.round(c.revenue).toLocaleString()}</td>
                        <td>${c.percentage}%</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderPaymentMethods(data: any): string {
    return `
        <div class="summary-grid">
            <div class="summary-card">
                <div class="label">Transaction Count</div>
                <div class="value">${data.summary.total_transactions}</div>
            </div>
            <div class="summary-card">
                <div class="label">Total Volume</div>
                <div class="value">Rs. ${Math.round(data.summary.total_volume).toLocaleString()}</div>
            </div>
        </div>

        <h3>Payment Method Analysis</h3>
        <table>
            <thead>
                <tr>
                    <th>Method</th>
                    <th>Transactions</th>
                    <th>Total Received</th>
                    <th>Share</th>
                </tr>
            </thead>
            <tbody>
                ${data.breakdown.map((b: any) => `
                    <tr>
                        <td>${b.name}</td>
                        <td>${b.transaction_count}</td>
                        <td>Rs. ${Math.round(b.total_amount).toLocaleString()}</td>
                        <td>${b.percentage}%</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderDailySales(data: any): string {
    const s = data.summary;
    return `
        <div class="summary-grid">
            <div class="summary-card">
                <div class="label">Gross Sales</div>
                <div class="value">Rs. ${Number(s.gross_sales).toLocaleString()}</div>
            </div>
            <div class="summary-card">
                <div class="label">Net Sales</div>
                <div class="value">Rs. ${Number(s.net_sales).toLocaleString()}</div>
            </div>
            <div class="summary-card">
                <div class="label">Tax Collected</div>
                <div class="value">Rs. ${Number(s.total_tax).toLocaleString()}</div>
            </div>
            <div class="summary-card">
                <div class="label">Order Count</div>
                <div class="value">${s.order_count}</div>
            </div>
        </div>

        <h3>Revenue Breakdown</h3>
        <table>
            <thead>
                <tr>
                    <th>Metric</th>
                    <th>Subtotal</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>Service Charges</td><td>Rs. ${Number(s.total_service_charge).toLocaleString()}</td></tr>
                <tr><td>Delivery Fees</td><td>Rs. ${Number(s.total_delivery_fees).toLocaleString()}</td></tr>
                <tr><td>Discounts Given</td><td class="negative">- Rs. ${Number(s.total_discounts).toLocaleString()}</td></tr>
                <tr><td><b>Total Revenue</b></td><td><b>Rs. ${Number(s.gross_sales).toLocaleString()}</b></td></tr>
            </tbody>
        </table>

        <h3>Order Type Distribution</h3>
        <table>
            <thead>
                <tr>
                    <th>Type</th>
                    <th>Count</th>
                    <th>Revenue</th>
                    <th>% of Total</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(data.order_types).map(([type, stats]: [string, any]) => `
                    <tr>
                        <td>${type}</td>
                        <td>${stats.count}</td>
                        <td>Rs. ${Number(stats.revenue).toLocaleString()}</td>
                        <td>${Math.round((stats.revenue / s.gross_sales) * 100)}%</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderTaxLiability(data: any): string {
    return `
        <div class="summary-grid">
            <div class="summary-card">
                <div class="label">Total Tax Due</div>
                <div class="value">Rs. ${Number(data.summary.total_tax).toLocaleString()}</div>
            </div>
            <div class="summary-card">
                <div class="label">Taxable Sales</div>
                <div class="value">Rs. ${Number(data.summary.taxable_sales).toLocaleString()}</div>
            </div>
        </div>

        <h3>Tax Details by Label</h3>
        <table>
            <thead>
                <tr>
                    <th>Tax Label</th>
                    <th>Base Amount</th>
                    <th>Tax Amount</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(data.tax_breakdown).map(([label, stats]: [string, any]) => `
                    <tr>
                        <td>${label}</td>
                        <td>Rs. ${Number(stats.base).toLocaleString()}</td>
                        <td>Rs. ${Number(stats.tax).toLocaleString()}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <h3>FBR Sync Summary</h3>
        <p>Total Sync Failures: <span class="badge ${data.summary.fbr_sync_failures > 0 ? 'badge-danger' : 'badge-success'}">${data.summary.fbr_sync_failures}</span></p>
    `;
}

function renderLossPrevention(data: any): string {
    return `
        <div class="summary-grid">
            <div class="summary-card">
                <div class="label">Lost Value</div>
                <div class="value negative">Rs. ${Number(data.summary.total_lost_value).toLocaleString()}</div>
            </div>
            <div class="summary-card">
                <div class="label">Exception Rate</div>
                <div class="value">${data.summary.exception_rate}%</div>
            </div>
            <div class="summary-card">
                <div class="label">Void Count</div>
                <div class="value">${data.summary.voided_count}</div>
            </div>
        </div>

        ${data.alerts.length > 0 ? `
            <div style="background: #fff7ed; border: 1px solid #ffedd5; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
                <h4 style="margin: 0 0 10px 0; color: #9a3412;">Security Alerts</h4>
                <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #c2410c;">
                    ${data.alerts.map((a: string) => `<li>${a}</li>`).join('')}
                </ul>
            </div>
        ` : ''}

        <h3>Recent Voids</h3>
        <table>
            <thead>
                <tr>
                    <th>Order #</th>
                    <th>Staff</th>
                    <th>Reason</th>
                    <th>Value</th>
                    <th>Time</th>
                </tr>
            </thead>
            <tbody>
                ${data.recent_voids.map((v: any) => `
                    <tr>
                        <td>${v.order_number}</td>
                        <td>${v.staff}</td>
                        <td>${v.reason}</td>
                        <td>Rs. ${Number(v.total).toLocaleString()}</td>
                        <td>${new Date(v.voided_at).toLocaleTimeString()}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderStaffPerformance(data: any): string {
    return `
        <div class="summary-grid">
            <div class="summary-card">
                <div class="label">Active Servers</div>
                <div class="value">${data.summary.total_waiters_active}</div>
            </div>
            <div class="summary-card">
                <div class="label">Active Riders</div>
                <div class="value">${data.summary.total_riders_active}</div>
            </div>
        </div>

        <h3>Server Rankings (By Revenue)</h3>
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Orders</th>
                    <th>Total Revenue</th>
                    <th>Avg Ticket</th>
                </tr>
            </thead>
            <tbody>
                ${data.waiters.map((w: any) => `
                    <tr>
                        <td>${w.name}</td>
                        <td>${w.orders}</td>
                        <td>Rs. ${Math.round(w.revenue).toLocaleString()}</td>
                        <td>Rs. ${Math.round(w.avg_order).toLocaleString()}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <h3>Rider Efficiency</h3>
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Deliveries</th>
                    <th>Revenue Handled</th>
                </tr>
            </thead>
            <tbody>
                ${data.riders.map((r: any) => `
                    <tr>
                        <td>${r.name}</td>
                        <td>${r.deliveries}</td>
                        <td>Rs. ${Math.round(r.revenue).toLocaleString()}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}
function renderRiderAudit(data: any): string {
    return `
        <div class="summary-grid">
            <div class="summary-card">
                <div class="label">Total Deliveries</div>
                <div class="value">${data.summary.total_orders}</div>
            </div>
            <div class="summary-card">
                <div class="label">Revenue Collected</div>
                <div class="value">Rs. ${Math.round(data.summary.total_revenue).toLocaleString()}</div>
            </div>
            <div class="summary-card">
                <div class="label">Pending Cash</div>
                <div class="value">Rs. ${Math.round(data.summary.pending_revenue).toLocaleString()}</div>
            </div>
            <div class="summary-card">
                <div class="label">Failed/Returned</div>
                <div class="value ${data.summary.failed_orders > 0 ? 'negative' : ''}">${data.summary.failed_orders}</div>
            </div>
        </div>

        <h3>Rider Information</h3>
        <p><b>Name:</b> ${data.rider.name} <i>(${data.rider.role || 'RIDER'})</i></p>

        <h3>Detailed Delivery Log</h3>
        <table>
            <thead>
                <tr>
                    <th>Order #</th>
                    <th>Time</th>
                    <th>Customer / Address</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Payment</th>
                </tr>
            </thead>
            <tbody>
                ${data.orders.map((o: any) => `
                    <tr>
                        <td>${o.order_number}</td>
                        <td>${new Date(o.time).toLocaleTimeString()}</td>
                        <td>
                            <b>${o.customer}</b><br/>
                            <span style="font-size: 11px; color: var(--secondary);">${o.address}</span>
                        </td>
                        <td>Rs. ${Math.round(o.total).toLocaleString()}</td>
                        <td>
                            <span class="badge ${o.status === 'CLOSED' || o.status === 'DELIVERED' ? 'badge-success' : 'badge-danger'}">
                                ${o.status}
                            </span>
                            ${o.failed_reason ? `<br/><small class="negative">${o.failed_reason}</small>` : ''}
                        </td>
                        <td>${o.payment_method}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}
