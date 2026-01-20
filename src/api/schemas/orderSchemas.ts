import { z } from 'zod';

export const orderUpsertSchema = z.object({
    id: z.string().uuid().optional(),
    restaurant_id: z.string().uuid(),
    type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'RESERVATION']),
    status: z.string(),
    guest_count: z.number().int().min(1).default(1),
    table_id: z.string().uuid().nullable().optional(),
    customer_name: z.string().optional(),
    customer_phone: z.string().optional(),
    order_items: z.array(z.object({
        menu_item_id: z.string().uuid(),
        quantity: z.number().int().min(1),
        unit_price: z.number().min(0),
        notes: z.string().optional()
    })).optional().default([])
});

export type OrderUpsertInput = z.infer<typeof orderUpsertSchema>;
