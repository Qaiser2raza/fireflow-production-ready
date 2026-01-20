import { Table, Order } from '@/types';

export class ApiService {
    private static baseUrl = 'http://localhost:3001/api';

    // --- TABLES ---
    static async updateTable(id: string, data: Partial<Table>): Promise<Table> {
        const res = await fetch(`${this.baseUrl}/tables`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...data })
        });
        if (!res.ok) throw new Error('Failed to update table');
        return res.json();
    }

    static async mergeTables(tableIds: string[], mergeId: string): Promise<void> {
        const res = await fetch(`${this.baseUrl}/tables/merge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tableIds, mergeId })
        });
        if (!res.ok) throw new Error('Failed to merge tables');
    }

    // --- RESERVATIONS ---
    static async fetchReservations(restaurantId: string): Promise<any[]> {
        const res = await fetch(`${this.baseUrl}/reservations?restaurant_id=${restaurantId}`);
        if (!res.ok) return [];
        return res.json();
    }

    // Add more as we migrate...
}
