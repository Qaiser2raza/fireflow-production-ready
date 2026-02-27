import { Table } from '../types';

const API_URL = 'http://localhost:3001/api';

export const tableService = {
    fetchTables: async (restaurantId: string): Promise<Table[]> => {
        const res = await fetch(`${API_URL}/tables?restaurant_id=${restaurantId}`);
        if (!res.ok) throw new Error('Failed to fetch tables');
        return res.json();
    },

    createTable: async (data: Partial<Table>): Promise<Table> => {
        const res = await fetch(`${API_URL}/tables`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed to create table');
        return res.json();
    },

    updateTable: async (id: string, data: Partial<Table>): Promise<Table> => {
        const res = await fetch(`${API_URL}/tables`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...data })
        });
        if (!res.ok) throw new Error('Failed to update table');
        return res.json();
    },

    deleteTable: async (id: string): Promise<void> => {
        const res = await fetch(`${API_URL}/tables?id=${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete table');
    }
};
