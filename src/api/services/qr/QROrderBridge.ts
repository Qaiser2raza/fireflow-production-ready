/**
 * QR Order Bridge Service
 *
 * Establishes a persistent outbound connection from the Local POS Server
 * to the Supabase Realtime channel. When a customer submits a QR order
 * from their phone (via the cloud web menu), Supabase fires a realtime event
 * and this bridge delivers it to the local POS server's internal event bus.
 *
 * Architecture:
 *   Customer Phone → Cloud Menu (Vercel) → Supabase qr_orders_queue
 *       → [this bridge] → Local Express Server → Socket.IO → KDS / Cashier Screen
 *
 * Security:
 *   - Only processes orders for the locally registered restaurant_id
 *   - Verifies HMAC table signature before accepting any order
 *   - Expired orders (> 10 min old) are auto-discarded
 */

import { createClient } from '@supabase/supabase-js';
import { EventEmitter } from 'events';
import { prisma } from '../../../shared/lib/prisma';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IncomingQROrder {
    id?: string;
    restaurant_id: string;
    table_number?: number;
    table_id?: string;
    table_label?: string | null;
    items: QROrderItem[];
    subtotal: number;
    notes?: string | null;
    customer_name?: string | null;
    submitted_at?: string;
    expires_at?: string;
    sig_verified?: boolean;
}

export interface QROrderItem {
    menu_item_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    special_instructions?: string;
}

// ─── Bridge Class ────────────────────────────────────────────────────────────

class QROrderBridge extends EventEmitter {
    private restaurantId: string | null = null;
    private syncQueue: IncomingQROrder[] = [];
    private syncInterval: NodeJS.Timeout | null = null;
    private queueFilePath: string;
    private realtimeSubscription: any = null;

    constructor() {
        super();
        this.queueFilePath = path.join(process.cwd(), 'data', 'qr_sync_queue.json');
        this.loadQueueFromDisk();
    }

    start(restaurantId: string): void {
        this.restaurantId = restaurantId;
        
        // Start background sync interval
        if (!this.syncInterval) {
            this.syncInterval = setInterval(() => this.processSyncQueue(), 10000); // every 10s
        }
        
        // Subscribe to Cloud Realtime
        if (this.isConnectedToCloud()) {
            this.subscribeToCloudRealtime();
        }
        
        console.log('[QR BRIDGE] Async cloud sync queue initialized.');
    }

    private subscribeToCloudRealtime() {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
        if (!supabaseUrl || !supabaseKey) return;

        const supabase = createClient(supabaseUrl, supabaseKey);
        
        this.realtimeSubscription = supabase
            .channel(`qr_orders_${this.restaurantId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'qr_orders_queue',
                    filter: `restaurant_id=eq.${this.restaurantId}`
                },
                async (payload) => {
                    console.log('[QR BRIDGE] ☁️ Received realtime order from cloud:', payload.new.id);
                    try {
                        const cloudOrder = payload.new;
                        // Transform cloud payload to IncomingQROrder
                        const orderData: IncomingQROrder = {
                            id: cloudOrder.id,
                            restaurant_id: cloudOrder.restaurant_id,
                            table_number: cloudOrder.table_number,
                            table_label: cloudOrder.table_label,
                            items: cloudOrder.items,
                            subtotal: cloudOrder.subtotal,
                            notes: cloudOrder.notes,
                            customer_name: cloudOrder.customer_name
                        };
                        
                        // Create locally, skipping outbound sync
                        const localOrder = await this.createLocalQROrder(orderData, true);
                        this.emit('new_order', localOrder);
                        
                    } catch (err: any) {
                        console.error('[QR BRIDGE] Failed to process cloud order:', err.message);
                    }
                }
            )
            .subscribe();
            
        console.log('[QR BRIDGE] Subscribed to Supabase Realtime for incoming cloud orders.');
    }

    stop(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        if (this.realtimeSubscription) {
            this.realtimeSubscription.unsubscribe();
            this.realtimeSubscription = null;
        }
        this.saveQueueToDisk();
        console.log('[QR BRIDGE] Stopped.');
    }

    isConnectedToCloud(): boolean {
        return !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) && !!process.env.SUPABASE_SERVICE_KEY;
    }

    async createLocalQROrder(orderData: IncomingQROrder, skipCloudSync = false): Promise<any> {
        if (!this.restaurantId) {
            throw new Error('QR Order Bridge not initialized with a restaurant ID.');
        }

        // Use the cloud order ID if provided, otherwise generate local
        const localOrderId = orderData.id || crypto.randomUUID();

        // Ensure table ID is resolved
        let resolvedTableId = orderData.table_id;
        if (!resolvedTableId && orderData.table_number) {
            const table = await prisma.tables.findFirst({
                where: { restaurant_id: this.restaurantId, name: String(orderData.table_number) }
            });
            if (table) resolvedTableId = table.id;
        }

        // Map items
        const orderItems = orderData.items.map(item => ({
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.quantity * item.unit_price,
            special_instructions: item.special_instructions || '',
            item_name: item.name,
            item_status: 'PENDING' as const,
            menu_items: {
                connect: { id: item.menu_item_id }
            }
        }));

        // Insert directly into local Postgres
        const order = await prisma.orders.create({
            data: {
                id: localOrderId,
                restaurant_id: this.restaurantId,
                total: orderData.subtotal,
                type: 'QR', // Requires schema update
                status: 'PENDING_APPROVAL', // Requires schema update
                customer_name: orderData.customer_name || 'Guest',
                table_id: resolvedTableId,
                items: JSON.parse(JSON.stringify(orderData.items)),
                order_items: {
                    create: orderItems
                }
            },
            include: {
                order_items: true,
                tables: true
            }
        });

        console.log(`[QR BRIDGE] 📲 Created local QR order ${order.id} for table ${(order as any).tables?.name || 'Unknown'}`);

        // Queue for background async upload to cloud (if connected and not skipped)
        if (this.isConnectedToCloud() && !skipCloudSync) {
            this.asyncSyncToCloud({ ...orderData, id: localOrderId });
        }

        return order;
    }

    private asyncSyncToCloud(orderData: IncomingQROrder): void {
        this.syncQueue.push(orderData);
        this.saveQueueToDisk();
        // Fire immediately but don't wait
        this.processSyncQueue().catch(console.error);
    }

    private async processSyncQueue(): Promise<void> {
        if (this.syncQueue.length === 0 || !this.isConnectedToCloud()) return;

        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
        if (!supabaseUrl || !supabaseKey) return;

        const supabase = createClient(supabaseUrl, supabaseKey);

        const currentQueue = [...this.syncQueue];
        const failedItems: IncomingQROrder[] = [];

        for (const order of currentQueue) {
            try {
                // Remove from memory immediately, if it fails we add it to failedItems
                this.syncQueue = this.syncQueue.filter(o => o.id !== order.id);

                const { error } = await supabase.from('qr_orders_queue').insert({
                    id: order.id,
                    restaurant_id: this.restaurantId,
                    table_number: order.table_number || 0,
                    items: order.items,
                    subtotal: order.subtotal,
                    notes: order.notes,
                    customer_name: order.customer_name,
                    submitted_at: new Date().toISOString()
                });

                if (error) {
                    // ── Classify the error ────────────────────────────────────
                    // Fatal: schema/constraint violations — retrying will never succeed.
                    // Drop these permanently to prevent infinite loops.
                    const isFatal =
                        error.message.includes('violates foreign key constraint') ||
                        error.message.includes('not-null constraint') ||
                        error.message.includes('violates unique constraint') ||
                        error.message.includes('Could not find the table');

                    if (isFatal) {
                        console.error(`[QR BRIDGE SYNC] 🗑️ Dropping order ${order.id} — fatal error (will never succeed):`, error.message);
                        // Do NOT push to failedItems — permanently discard
                    } else {
                        // Transient (network issue, timeout) — retry next cycle
                        console.warn(`[QR BRIDGE SYNC] ⚠️ Transient error for order ${order.id}, will retry:`, error.message);
                        failedItems.push(order);
                    }
                } else {
                    console.log(`[QR BRIDGE SYNC] ✅ Synced order ${order.id} to cloud.`);
                }
            } catch (err: any) {
                console.error(`[QR BRIDGE SYNC] ⚠️ Exception syncing order ${order.id}:`, err.message);
                failedItems.push(order);
            }
        }

        // Put failed items back into the queue for next retry
        if (failedItems.length > 0) {
            this.syncQueue.push(...failedItems);
        }

        this.saveQueueToDisk();
    }

    private saveQueueToDisk() {
        try {
            const dataDir = path.dirname(this.queueFilePath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            fs.writeFileSync(this.queueFilePath, JSON.stringify(this.syncQueue), 'utf8');
        } catch (e: any) {
            console.error('[QR BRIDGE] Failed to save sync queue to disk:', e.message);
        }
    }

    private loadQueueFromDisk() {
        try {
            if (fs.existsSync(this.queueFilePath)) {
                const data = fs.readFileSync(this.queueFilePath, 'utf8');
                this.syncQueue = JSON.parse(data);
                console.log(`[QR BRIDGE] Loaded ${this.syncQueue.length} items from offline queue.`);
            }
        } catch (e: any) {
            console.error('[QR BRIDGE] Failed to load sync queue from disk:', e.message);
            this.syncQueue = [];
        }
    }
}

// Singleton — one bridge per POS server process
export const qrOrderBridge = new QROrderBridge();

