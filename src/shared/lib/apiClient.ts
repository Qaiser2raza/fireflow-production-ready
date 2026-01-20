/**
 * Database Module - Local PostgreSQL REST API Client
 * Replaces Supabase with direct PostgreSQL connections via local Express server
 * Server running on http://localhost:3001/api
 */

const API_BASE_URL = `http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:3001/api`;

// 1. Fixed Interface to match implementation
interface QueryBuilder {
  select: (columns?: string, options?: { count?: string; head?: boolean }) => QueryBuilder;
  eq: (column: string, value: any) => QueryBuilder;
  neq: (column: string, value: any) => QueryBuilder;
  or: (filter: string) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  single: () => QueryBuilder;
  maybeSingle: () => QueryBuilder;
  insert: (data: any) => QueryBuilder;
  update: (data: any) => QueryBuilder;
  delete: () => QueryBuilder;
  then: (onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) => Promise<any>;
}

class LocalDatabaseBuilder implements QueryBuilder {
  private table: string;
  private filters: Record<string, any> = {};
  private limitVal: number | null = null;
  private orderCol: string | null = null;
  private orderAsc: boolean = true;
  private method: string = 'GET';
  private bodyData: any = null;
  private isSingle: boolean = false;
  private selectCols: string = '*';

  constructor(table: string) {
    this.table = table;
  }

  // 2. Fixed select signature to match your SuperAdminView calls
  select(columns: string = '*', options?: { count?: string; head?: boolean }) {
    this.selectCols = columns;
    // Note: 'count' and 'head' are ignored locally but prevented from crashing
    return this;
  }

  eq(column: string, value: any) {
    this.filters[column] = value;
    return this;
  }

  neq(column: string, value: any) {
    this.filters[column] = `neq.${value}`;
    return this;
  }

  or(filter: string) {
    this.filters['$or'] = filter;
    return this;
  }

  limit(count: number) {
    this.limitVal = count;
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderCol = column;
    this.orderAsc = options.ascending !== false;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    return this;
  }

  insert(data: any) {
    this.method = 'POST';
    this.bodyData = data;
    return this;
  }

  update(data: any) {
    this.method = 'PATCH';
    this.bodyData = data;
    return this;
  }

  delete() {
    this.method = 'DELETE';
    return this;
  }

  async execute(): Promise<{ data: any; error: any }> {
    try {
      const params = new URLSearchParams();
      
      Object.entries(this.filters).forEach(([key, value]) => {
        params.set(key, String(value));
      });

      if (this.limitVal) {
        params.set('$limit', this.limitVal.toString());
      }

      if (this.orderCol) {
        params.set('$order', `${this.orderCol}.${this.orderAsc ? 'asc' : 'desc'}`);
      }

      let url = `${API_BASE_URL}/${this.table}`;
      
      // Handle upsert logic
      if (this.method === 'POST' && this.bodyData && !Array.isArray(this.bodyData)) {
        if (this.bodyData.id && this.filters.id) {
          url += '/upsert';
        }
      }

      if (params.toString()) {
        url += (url.includes('?') ? '&' : '?') + params.toString();
      }

      const options: RequestInit = {
        method: this.method,
        headers: { 'Content-Type': 'application/json' }
      };

      if (this.bodyData) {
        options.body = JSON.stringify(this.bodyData);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        return { data: null, error: errorData };
      }

      const data = await response.json();

      // Handle single vs array responses for compatibility
      if (this.isSingle) {
        return {
          data: Array.isArray(data) ? data[0] || null : data,
          error: null
        };
      }

      return {
        data: Array.isArray(data) ? data : [data],
        error: null
      };

    } catch (error) {
      console.error(`Database error on ${this.table}:`, error);
      return {
        data: null,
        error: error instanceof Error ? { message: error.message } : error
      };
    }
  }

  // Standard Promise thenable
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class LocalDatabase {
  from(table: string) {
    return new LocalDatabaseBuilder(table);
  }

  async rpc(functionName: string, params: any) {
    try {
      const response = await fetch(`${API_BASE_URL}/rpc/${functionName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        return { data: null, error };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      console.error(`RPC error on ${functionName}:`, error);
      return {
        data: null,
        error: error instanceof Error ? { message: error.message } : error
      };
    }
  }
}

export const db = new LocalDatabase();

// Export for compatibility with old Supabase imports
export const supabase = {
  from: (table: string) => db.from(table),
  rpc: (name: string, params: any) => db.rpc(name, params),
  auth: {
    getUser: async () => {
      return { data: { user: null } };
    }
  }
};

// Add this at the bottom of your file
export const apiClient = db; // This fixes the "No exported member 'apiClient'" error
export { db as database };   // High-level alias