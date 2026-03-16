import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { logger, LogLevel } from '../../shared/lib/logger';

const prisma = new PrismaClient();

export interface SyncResult {
    success: boolean;
    invoiceNumber?: string;
    qrCode?: string;
    error?: string;
}

export class FBRService {
    private static instance: FBRService;

    public static getInstance(): FBRService {
        if (!FBRService.instance) {
            FBRService.instance = new FBRService();
        }
        return FBRService.instance;
    }

    /**
     * Synchronize an order with FBR IMS
     */
    async syncOrder(orderId: string): Promise<SyncResult> {
        try {
            const order = await prisma.orders.findUnique({
                where: { id: orderId },
                include: {
                    order_items: {
                        include: {
                            menu_items: true
                        }
                    },
                    restaurants: true,
                    transactions: true
                }
            });

            if (!order) {
                return { success: false, error: 'Order not found' };
            }

            const restaurant = order.restaurants;
            if (!(restaurant as any).fbr_enabled) {
                return { success: false, error: 'FBR Integration not enabled for this restaurant' };
            }

            const payload = this.buildFBRPayload(order);
            const imsUrl = (restaurant as any).fbr_ims_url || 'https://ims.fbr.gov.pk/api/Live/PostData';

            // Log attempt
            const logEntry = await (prisma as any).fbr_sync_logs.create({
                data: {
                    restaurant_id: order.restaurant_id,
                    order_id: order.id,
                    request_payload: payload as any,
                    status: 'PENDING'
                }
            });

            try {
                const response = await axios.post(imsUrl, payload, {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000 // 10s timeout
                });

                const fbrResponse = response.data;

                // Update log with response
                await (prisma as any).fbr_sync_logs.update({
                    where: { id: logEntry.id },
                    data: {
                        response_payload: fbrResponse,
                        status: fbrResponse.Response === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
                        error_message: fbrResponse.Response === 'SUCCESS' ? null : fbrResponse.Errors?.[0]?.Message || 'FBR Rejected'
                    }
                });

                if (fbrResponse.Response === 'SUCCESS') {
                    // Update order with FBR details
                    await prisma.orders.update({
                        where: { id: order.id },
                        data: {
                            fbr_invoice_number: fbrResponse.InvoiceNumber,
                            fbr_sync_status: 'SYNCED',
                            fbr_qr_code: `https://ims.fbr.gov.pk/Verify/${fbrResponse.InvoiceNumber}`, // Example QR link
                            fbr_response: JSON.stringify(fbrResponse)
                        } as any
                    });

                    return {
                        success: true,
                        invoiceNumber: fbrResponse.InvoiceNumber,
                        qrCode: fbrResponse.QRCode
                    };
                } else {
                    await prisma.orders.update({
                        where: { id: order.id },
                        data: {
                            fbr_sync_status: 'FAILED',
                            fbr_response: JSON.stringify(fbrResponse)
                        } as any
                    });

                    return {
                        success: false,
                        error: fbrResponse.Errors?.[0]?.Message || 'FBR Synchronization Failed'
                    };
                }

            } catch (apiErr: any) {
                const errorMessage = apiErr.response?.data?.Errors?.[0]?.Message || apiErr.message;

                await (prisma as any).fbr_sync_logs.update({
                    where: { id: logEntry.id },
                    data: {
                        status: 'ERROR',
                        error_message: errorMessage
                    }
                });

                return { success: false, error: `Connection Error: ${errorMessage}` };
            }

        } catch (err: any) {
            logger.log({
                level: LogLevel.ERROR,
                service: 'FBR_SERVICE',
                action: 'sync_order_crash',
                error: { message: err.message }
            });
            return { success: false, error: err.message };
        }
    }

    /**
     * Map internal order data to FBR standard JSON
     */
    private buildFBRPayload(order: any) {
        const restaurant = order.restaurants;
        const items = order.order_items.map((item: any) => {
            const saleValue = Number(item.unit_price) * item.quantity;
            const taxCharged = saleValue * (Number(restaurant.tax_rate) / 100);

            return {
                ItemCode: item.menu_items?.id?.substring(0, 8) || 'GEN001',
                ItemName: item.item_name || item.menu_items?.name,
                Quantity: Number(item.quantity),
                PCTCode: "2106.9090", // Standard for cooked food
                TaxRate: Number(restaurant.tax_rate),
                SaleValue: saleValue,
                TaxCharged: taxCharged,
                TotalAmount: saleValue + taxCharged,
                InvoiceType: 1, // 1 = Sale, 2 = Debit Note, 3 = Credit Note
                Refractor: 0.0
            };
        });

        const totalSaleValue = items.reduce((acc: number, item: any) => acc + item.SaleValue, 0);
        const totalTaxCharged = items.reduce((acc: number, item: any) => acc + item.TaxCharged, 0);

        return {
            InvoiceNumber: "", // FBR will generate
            POSID: parseInt((restaurant as any).fbr_pos_id || "0"),
            USIN: order.order_number || order.id.substring(0, 8),
            DateTime: new Date(order.created_at).toISOString().replace('T', ' ').split('.')[0],
            BuyerName: order.customer_name || "Guest",
            BuyerPhoneNumber: order.customer_phone || "00000000000",
            BuyerNTN: "",
            TotalBillAmount: Number(order.total),
            TotalQuantity: order.order_items.reduce((acc: number, i: any) => acc + Number(i.quantity), 0),
            TotalSaleValue: totalSaleValue,
            TotalTaxCharged: totalTaxCharged,
            Discount: Number(order.discount || 0),
            FurtherTax: 0.0,
            PaymentMode: this.mapPaymentMode(order.payment_method),
            InvoiceType: 1,
            Items: items
        };
    }

    private mapPaymentMode(method: string): number {
        // 1 = Cash, 2 = Card, 3 = Digital/Other
        switch (method) {
            case 'CASH': return 1;
            case 'CARD': return 2;
            default: return 3;
        }
    }
}

export const fbrService = FBRService.getInstance();
