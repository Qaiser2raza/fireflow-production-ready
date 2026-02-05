/**
 * Socket.IO Client - Real-time event listener
 * Replaces Supabase realtime subscriptions
 */

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = `http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:3001`;

class SocketIOClient {
    private socket: Socket | null = null;
    private listeners: Record<string, Function[]> = {};

    connect() {
        if (this.socket) return; // Already connecting or connected

        this.socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'], // Prefer websockets
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity // Keep trying
        });

        this.socket.on('connect', () => {
            console.log('[SOCKET.IO] Connected to server');
        });

        this.socket.on('disconnect', () => {
            console.log('[SOCKET.IO] Disconnected from server');
        });

        this.socket.on('error', (error) => {
            console.error('[SOCKET.IO] Error:', error);
        });

        // Generic database change events
        this.socket.on('db_change', (data) => {
            console.log('[SOCKET.IO] Database change:', data);
            this.emit(`db_change_${data.table}`, data);
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    on(event: string, callback: Function) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);

        // Also listen on socket
        if (this.socket) {
            this.socket.on(event, (data) => callback(data));
        }
    }

    off(event: string, callback?: Function) {
        if (callback && this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        } else {
            delete this.listeners[event];
        }

        if (this.socket) {
            this.socket.off(event);
        }
    }

    emit(event: string, data?: any) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
        if (this.socket) {
            this.socket.emit(event, data);
        }
    }

    // Subscribe to table changes (replaces Supabase realtime)
    subscribeToTableChanges(table: string, filter: Record<string, any>, callback: (payload: any) => void) {
        const eventName = `table_change_${table}`;

        this.on(eventName, (data: any) => {
            // Apply filter if provided
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
        });

        return {
            unsubscribe: () => this.off(eventName)
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
