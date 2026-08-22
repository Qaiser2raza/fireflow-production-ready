/**
 * Socket.IO Client - Real-time event listener
 * Replaces Supabase realtime subscriptions
 */

import { io, Socket } from 'socket.io-client';

const isLocalDev = (typeof window !== 'undefined'
    ? /^(localhost|127\.0\.0\.1|::1|0\.0\.0\.0)$/.test(window.location.hostname)
    : true);

const SOCKET_URL = (typeof window !== 'undefined'
    ? (isLocalDev ? 'http://localhost:3001' : window.location.origin)
    : 'http://localhost:3001');

class SocketIOClient {
    private socket: Socket | null = null;
    // Map of event → Set of callback functions
    private listeners: Record<string, Set<Function>> = {};
    // Track which events we've wired to the raw socket (so we only do it once)
    private socketBoundEvents: Set<string> = new Set();

    connect() {
        if (this.socket && this.socket.connected) return;

        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        const accessToken = localStorage.getItem('accessToken');

        this.socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 20,
            timeout: 10000,
            extraHeaders: accessToken ? {
                'Authorization': `Bearer ${accessToken}`
            } : {}
        });

        let lastErrorMsg = '';
        let errCount = 0;

        this.socket.on('connect', () => {
            console.log('[SOCKET.IO] Connected to server');
            errCount = 0;
            lastErrorMsg = '';
            // Re-dispatch to all registered wrapper listeners
            this._dispatchToListeners('connect', undefined);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[SOCKET.IO] Disconnected from server:', reason);
        });

        this.socket.on('error', (error) => {
            const msg = typeof error === 'string' ? error : (error?.message || 'unknown');
            errCount++;
            // Rate-limit error logging: log first 3 errors, then every 10th
            if (errCount <= 3 || errCount % 10 === 0) {
                console.error('[SOCKET.IO] Error:', msg, '(attempt ' + errCount + ')');
            } else if (msg !== lastErrorMsg) {
                lastErrorMsg = msg;
            }
        });

        // The one and only raw socket binding for db_change — never removed
        this.socket.on('db_change', (data) => {
            console.log('[SOCKET.IO] db_change:', data.table, data.eventType);
            this._dispatchToListeners('db_change', data);
        });

        this.socketBoundEvents.add('connect');
        this.socketBoundEvents.add('db_change');
    }

    /** Internal: fan-out a raw event to all registered wrapper callbacks */
    private _dispatchToListeners(event: string, data: any) {
        const cbs = this.listeners[event];
        if (cbs) {
            cbs.forEach(cb => {
                try { cb(data); } catch (e) { console.error('[SOCKET.IO] listener error:', e); }
            });
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.socketBoundEvents.clear();
        }
    }

    /**
     * Register a callback for an event.
     * SAFE to call multiple times — duplicate callbacks are deduplicated.
     */
    on(event: string, callback: Function) {
        if (!this.listeners[event]) {
            this.listeners[event] = new Set();
        }
        this.listeners[event].add(callback);

        // For non-core events (not db_change/connect which are always bound),
        // bind once to the raw socket as a pass-through dispatcher.
        if (this.socket && !this.socketBoundEvents.has(event)) {
            this.socket.on(event, (data: any) => this._dispatchToListeners(event, data));
            this.socketBoundEvents.add(event);
        }
    }

    /**
     * Remove a specific callback, or ALL callbacks for an event.
     * NEVER removes the raw socket listener — only removes from the wrapper map.
     * This is the key fix: raw socket listeners are permanent dispatchers.
     */
    off(event: string, callback?: Function) {
        if (!this.listeners[event]) return;
        if (callback) {
            this.listeners[event].delete(callback);
        } else {
            // Clear all wrapper callbacks for this event
            this.listeners[event].clear();
        }
        // NOTE: We intentionally do NOT call this.socket.off(event) here.
        // The raw socket listeners are permanent fan-out dispatchers.
        // Removing them would break real-time updates for all subsequent registrations.
    }

    removeAllListeners(event: string) {
        this.off(event);
    }

    /**
     * Emit an event TO the server (or dispatch locally if no socket).
     */
    emit(event: string, data?: any) {
        if (this.socket?.connected) {
            this.socket.emit(event, data);
        } else {
            // Fallback: dispatch locally (for internal events like join before connect)
            this._dispatchToListeners(event, data);
        }
    }

    // Subscribe to table changes (replaces Supabase realtime)
    subscribeToTableChanges(table: string, filter: Record<string, any>, callback: (payload: any) => void) {
        const eventName = `table_change_${table}`;

        const handler = (data: any) => {
            if (filter && Object.keys(filter).length > 0) {
                let matches = true;
                for (const [key, value] of Object.entries(filter)) {
                    if (data.new?.[key] !== value && data.old?.[key] !== value) {
                        matches = false;
                        break;
                    }
                }
                if (!matches) return;
            }

            callback({
                eventType: data.eventType || data.type,
                new: data.new || data.payload,
                old: data.old
            });
        };

        this.on(eventName, handler);

        return {
            unsubscribe: () => this.off(eventName, handler)
        };
    }

    // Helper for Supabase-compatible interface
    channel(name: string) {
        return {
            on: (event: string, _filter: any, callback: Function) => {
                const eventName = `${name}_${event}`;
                this.on(eventName, callback);
                return this;
            },
            subscribe: () => {
                return this;
            },
            unsubscribe: () => {
                // Cleanup handled by off()
            }
        };
    }
}

export const socketIO = new SocketIOClient();

export default socketIO;
