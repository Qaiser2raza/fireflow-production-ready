// ==========================================
// AUDIT LOGGING UTILITY
// ==========================================
// Location: src/shared/lib/auditLog.ts
// Purpose: Centralized audit logging with type safety

export type AuditActionType = 
  | 'DB_RESEED'
  | 'CONFIG_UPDATE'
  | 'TABLE_MERGE'
  | 'TABLE_UNMERGE'
  | 'GUEST_COUNT_REDUCTION'
  | 'ORDER_VOID'
  | 'ORDER_CANCEL'
  | 'MENU_PRICE_CHANGE'
  | 'STAFF_LOGIN'
  | 'STAFF_LOGOUT'
  | 'PIN_HASH_MIGRATION'
  | 'DEVICE_PAIR';

export type AuditEntityType = 
  | 'SYSTEM'
  | 'RESTAURANT'
  | 'TABLE'
  | 'ORDER'
  | 'MENU_ITEM'
  | 'STAFF'
  | 'DINE_IN_ORDER';

export interface CreateAuditLogParams {
  restaurant_id: string;
  staff_id: string;
  action_type: AuditActionType;
  entity_type: AuditEntityType;
  entity_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<boolean> {
  try {
    const response = await fetch('/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        created_at: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`Audit log failed: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit failures shouldn't break user flow
    return false;
  }
}

/**
 * Fetch audit logs for a restaurant
 */
export async function fetchAuditLogs(
  restaurantId: string,
  filters?: {
    action_type?: AuditActionType;
    entity_type?: AuditEntityType;
    staff_id?: string;
    limit?: number;
    offset?: number;
  }
): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      restaurant_id: restaurantId,
      ...filters,
      limit: String(filters?.limit || 100),
      offset: String(filters?.offset || 0)
    });

    const response = await fetch(`/api/audit-logs?${params}`);
    const data = await response.json();

    return data.logs || [];
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return [];
  }
}