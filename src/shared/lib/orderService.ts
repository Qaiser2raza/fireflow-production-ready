
import { Order } from '@/types';

const API_URL = 'http://localhost:3001/api';

/**
 * Order Service - Handles all order API calls
 * 
 * IMPORTANT: Database schema expects snake_case field names
 * - table_id (not tableId)
 * - guest_count (not guestCount)
 * - customer_name (not customerName)
 * - customer_phone (not customerPhone)
 * - delivery_address (not deliveryAddress)
 * - assigned_waiter_id (not assignedWaiterId)
 * - assigned_driver_id (not assignedDriverId)
 * - service_charge (not serviceCharge)
 * - delivery_fee (not deliveryFee)
 */

export const orderService = {
    fetchOrders: async (restaurantId: string): Promise<Order[]> => {
        const res = await fetch(`${API_URL}/orders?restaurant_id=${restaurantId}`);
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(`Failed to fetch orders: ${error.error || res.statusText}`);
        }
        return res.json();
    },

    /**
     * Create a new order
     * Uses the generic upsert endpoint which handles both insert and update
     * If id is not provided, the server will generate one
     */
    createOrder: async (data: any): Promise<Order> => {
        // Validate required fields
        if (!data.restaurant_id) {
            throw new Error('restaurant_id is required');
        }
        if (!data.status) {
            throw new Error('status is required');
        }

        const res = await fetch(`${API_URL}/orders/upsert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(`Failed to create order: ${error.error || error.details?.join(', ') || res.statusText}`);
        }

        const order = await res.json();
        console.log('✅ Order created successfully:', order.id);
        return order;
    },

    /**
     * Update an existing order
     * Uses the generic upsert endpoint for consistency
     */
    updateOrder: async (id: string, data: any): Promise<Order> => {
        if (!id) {
            throw new Error('Order ID is required');
        }

        const res = await fetch(`${API_URL}/orders/upsert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...data })
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(`Failed to update order: ${error.error || res.statusText}`);
        }

        const order = await res.json();
        console.log('✅ Order updated successfully:', order.id);
        return order;
    }
};
