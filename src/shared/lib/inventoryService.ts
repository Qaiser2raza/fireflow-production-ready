import { fetchWithAuth } from './authInterceptor';
import type { InventoryItem, InventoryMovement, NegativeStockItem, RecalcWACResult, POLine, ReceivePOResult, StockCount, StockCountLine, StockCountAdjustment, CreateStockCountRequest, FinalizeStockCountRequest, AddStockCountLineRequest } from '../types';

export type { InventoryItem, InventoryMovement, NegativeStockItem, RecalcWACResult, POLine, ReceivePOResult, StockCount, StockCountLine, StockCountAdjustment, CreateStockCountRequest, FinalizeStockCountRequest, AddStockCountLineRequest };

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

    /** GET /api/inventory/counts - List stock counts for the tenant */
    async getStockCounts(status?: 'OPEN' | 'CLOSED', limit?: number): Promise<{ success: boolean; stockCounts: StockCount[] }> {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (limit) params.set('limit', String(limit));
        const url = `${API_URL}/inventory/counts${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetchWithAuth(url);
        if (!res.ok) throw new Error(`Failed to fetch stock counts: ${res.status}`);
        return res.json();
    },

    /** GET /api/inventory/counts/:id - Get a single stock count with lines */
    async getStockCountById(id: string): Promise<{ success: boolean; stockCount: StockCount }> {
        const res = await fetchWithAuth(`${API_URL}/inventory/counts/${id}`);
        if (!res.ok) throw new Error(`Failed to fetch stock count ${id}: ${res.status}`);
        return res.json();
    },

    /** POST /api/inventory/counts - Create a new stock count */
    async createStockCount(payload?: CreateStockCountRequest): Promise<{ success: boolean; stockCount: StockCount }> {
        const res = await fetchWithAuth(`${API_URL}/inventory/counts`, {
            method: 'POST',
            body: JSON.stringify(payload || { operationKey: generateOperationKey() }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `Failed to create stock count: ${res.status}`);
        }
        return res.json();
    },

    /** PATCH /api/inventory/counts/:id/lines - Add or update a count line */
    async addStockCountLine(countId: string, payload: AddStockCountLineRequest): Promise<{ success: boolean; line: StockCountLine }> {
        const res = await fetchWithAuth(`${API_URL}/inventory/counts/${countId}/lines`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `Failed to add count line: ${res.status}`);
        }
        return res.json();
    },

    /** POST /api/inventory/counts/:id/finalize - Finalize stock count and create adjustments */
    async finalizeStockCount(countId: string, _payload?: FinalizeStockCountRequest): Promise<{ success: boolean; stockCount: StockCount; adjustments: any[] }> {
        const res = await fetchWithAuth(`${API_URL}/inventory/counts/${countId}/finalize`, {
            method: 'POST',
            body: JSON.stringify(_payload || {}),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `Failed to finalize stock count: ${res.status}`);
        }
        return res.json();
    },
};