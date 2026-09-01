import { fetchWithAuth } from './authInterceptor';
import type { InventoryItem, InventoryMovement, NegativeStockItem, RecalcWACResult, POLine, ReceivePOResult } from '../types';

export type { InventoryItem, InventoryMovement, NegativeStockItem, RecalcWACResult, POLine, ReceivePOResult };

const API_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

function generateOperationKey(): string {
    return `recv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const inventoryService = {
    /** GET /api/inventory/items */
    async getAllItems(): Promise<{ success: boolean; items: InventoryItem[] }> {
        const res = await fetchWithAuth(`${API_URL}/inventory/items`);
        if (!res.ok) throw new Error(`Failed to fetch inventory items: ${res.status}`);
        return res.json();
    },

    /** GET /api/inventory/items/:id */
    async getItemById(id: string): Promise<{ success: boolean; item: InventoryItem }> {
        const res = await fetchWithAuth(`${API_URL}/inventory/items/${id}`);
        if (!res.ok) throw new Error(`Failed to fetch item ${id}: ${res.status}`);
        return res.json();
    },

    /** GET /api/inventory/items/:id/movements */
    async getMovements(id: string, limit?: number): Promise<{ success: boolean; itemId: string; itemName: string; movements: InventoryMovement[]; count: number }> {
        const params = new URLSearchParams();
        if (limit) params.set('limit', String(limit));
        const url = `${API_URL}/inventory/items/${id}/movements${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetchWithAuth(url);
        if (!res.ok) throw new Error(`Failed to fetch movements for ${id}: ${res.status}`);
        return res.json();
    },

    /** GET /api/inventory/negative-stock */
    async getNegativeStock(): Promise<{ success: boolean; items: NegativeStockItem[] }> {
        const res = await fetchWithAuth(`${API_URL}/inventory/negative-stock`);
        if (!res.ok) throw new Error(`Failed to fetch negative stock: ${res.status}`);
        return res.json();
    },

    /** GET /api/inventory/items/:id/wac */
    async recalcWAC(id: string): Promise<RecalcWACResult & { success: boolean }> {
        const res = await fetchWithAuth(`${API_URL}/inventory/items/${id}/wac`);
        if (!res.ok) throw new Error(`Failed to recalc WAC for ${id}: ${res.status}`);
        return res.json();
    },

    /** GET /api/inventory/po-lines - Get PO lines available for receiving */
    async getPOLInes(): Promise<{ success: boolean; poLines: POLine[] }> {
        const res = await fetchWithAuth(`${API_URL}/inventory/po-lines`);
        if (!res.ok) throw new Error(`Failed to fetch PO lines: ${res.status}`);
        return res.json();
    },

    /** POST /api/inventory/receive/:poLineId - Receive stock against a PO line */
    async receivePOLine(poLineId: string, quantity: number): Promise<ReceivePOResult> {
        const res = await fetchWithAuth(`${API_URL}/inventory/receive/${poLineId}`, {
            method: 'POST',
            body: JSON.stringify({ quantity, operationKey: generateOperationKey() }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `Failed to receive: ${res.status}`);
        }
        return res.json();
    },
};