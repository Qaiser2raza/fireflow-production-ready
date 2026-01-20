import { orders, Prisma } from '@prisma/client';

export type CreateOrderDTO = {
    restaurant_id: string;
    type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'RESERVATION';
    status: string;
    items: any[]; // refined later with specific item types
    [key: string]: any;
};

// E:\firefox3\Fireflow\src\services\orders\IOrderService.ts

export type UpdateOrderDTO = Partial<CreateOrderDTO> & {
    authorized_by?: string; // UUID of the manager who gave the PIN
};
export interface IOrderService {
    createOrder(data: CreateOrderDTO): Promise<orders>;
    updateOrder(id: string, data: UpdateOrderDTO): Promise<orders>;
    getOrderDetails(id: string): Promise<orders | null>;
    validateOrder(data: CreateOrderDTO): { valid: boolean; errors: string[] };
}
