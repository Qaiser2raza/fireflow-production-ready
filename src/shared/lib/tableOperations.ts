
import { Table, Order, Section, Reservation, ReservationConflict, VisualState, ValidationResult, OrderStatus } from '../types';

export class TableOperations {
    // --- 1. NAMING LOGIC ---
    static getNextTableName(tables: Table[], sectionId: string, sections: Section[]): string {
        const section = sections.find(s => s.id === sectionId);
        if (!section) return 'T-1';

        const prefix = section.prefix || 'T';
        const sectionTables = tables.filter(t => t.section_id === sectionId);

        // Extract numbers from existing tables (e.g. "T-1" -> 1)
        const usedNumbers = sectionTables
            .map(t => {
                const match = t.name.match(/(\d+)$/);
                return match ? parseInt(match[0]) : null;
            })
            .filter((n): n is number => n !== null)
            .sort((a, b) => a - b);

        // Find the lowest available number (Gap Detection)
        let nextNum = 1;
        for (const num of usedNumbers) {
            if (num === nextNum) {
                nextNum++;
            } else if (num > nextNum) {
                break; // Gap found
            }
        }

        return `${prefix}-${nextNum}`;
    }

    // --- 2. VALIDATION LOGIC ---
    static validateSeating(table: Table, guestCount: number, orders: Order[]): ValidationResult {
        const errors: string[] = [];

        // Ghost Rule
        if (!table) errors.push('Table not found');

        // Capacity Rule
        if (guestCount > table.capacity) {
            errors.push(`Capacity violation: Table has ${table.capacity} seats, cannot seat ${guestCount}.`);
        }

        // Lock Rule
        if (table.status === 'OCCUPIED' || table.status === 'DIRTY' || table.status === 'CLEANING') {
            const hasActiveOrder = orders.some(o => o.table_id === table.id && o.status !== OrderStatus.CLOSED && o.status !== OrderStatus.VOIDED && o.status !== OrderStatus.CANCELLED);
            if (hasActiveOrder) {
                errors.push('Table is currently locked (active order exists). Settle first.');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // --- 3. MERGE VALIDATION (Phase 2.2) ---
    static validateMerge(tables: Table[]): ValidationResult {
        const errors: string[] = [];

        // All tables must be available
        const unavailableTables = tables.filter(t => t.status !== 'AVAILABLE');
        if (unavailableTables.length > 0) {
            errors.push(`Cannot merge occupied tables: ${unavailableTables.map(t => t.name).join(', ')}`);
        }

        // All tables must be in same section
        const uniqueSections = new Set(tables.map(t => t.section_id));
        if (uniqueSections.size > 1) {
            errors.push('Cannot merge tables from different sections');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // --- 4. RESERVATION CONFLICT DETECTION (Phase 2.2) ---
    static checkReservationConflict(
        tableId: string,
        reservations: Reservation[],
        bufferMinutes: number = 20
    ): ReservationConflict | null {
        const now = new Date();
        const bufferMs = bufferMinutes * 60 * 1000;

        const upcomingReservation = reservations.find(res => {
            if (res.table_id !== tableId || res.status === 'CANCELLED' || res.status === 'COMPLETED') return false;
            const resTime = new Date(res.reservation_time).getTime();
            return resTime > now.getTime() && (resTime - now.getTime()) < bufferMs;
        });

        if (upcomingReservation) {
            const minutesUntil = Math.ceil(
                (new Date(upcomingReservation.reservation_time).getTime() - now.getTime()) / 60000
            );
            return {
                reservation: upcomingReservation,
                minutesUntil,
                message: `Reserved for ${upcomingReservation.customer_name} in ${minutesUntil} minutes`
            };
        }
        return null;
    }

    // --- 5. SPEC VISUAL STATES (Phase 2.1) ---
    static getVisualState(table: Table, order?: Order): VisualState {
        if (table.status === 'DIRTY') {
            return {
                className: 'bg-amber-900/50 border-amber-500/50 text-amber-200', // Red/Amber Solid (Adjusted to match existing scheme but logically solid)
                animation: '',
                icon: 'rotate-cw'
            };
        }

        if (table.status === 'CLEANING') {
            return {
                className: 'bg-blue-900/50 border-blue-500/50 text-blue-200',
                animation: 'animate-pulse',
                icon: 'loader'
            };
        }

        if (table.status === 'OUT_OF_SERVICE') {
            return {
                className: 'bg-black border-red-900 text-red-700 opacity-50',
                animation: '',
                icon: 'ban'
            };
        }

        if (table.status === 'OCCUPIED') {
            // Derived "Payment Pending" State
            if (order?.status === OrderStatus.BILL_REQUESTED) {
                return {
                    className: 'bg-orange-900/90 border-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.5)]',
                    animation: 'animate-pulse',
                    icon: 'credit-card'
                };
            }

            // Logic: If order placed < 10 mins ago -> Green Glow
            // If order placed > 45 mins ago -> Orange Warning (Stale)
            const lastInteraction = order?.created_at || table.last_status_change;
            const minutesAgo = lastInteraction ?
                (Date.now() - new Date(lastInteraction).getTime()) / 60000 :
                0;

            if (minutesAgo < 10) {
                return {
                    className: 'bg-emerald-900/80 border-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.5)]', // Green Glow
                    animation: '',
                    icon: 'users'
                };
            } else if (minutesAgo > 45) {
                return {
                    className: 'bg-red-900/80 border-red-500 text-white', // Long stay warning
                    animation: '',
                    icon: 'clock'
                };
            } else {
                return {
                    className: 'bg-slate-800 border-slate-600 text-slate-300', // Normal Occupied
                    animation: '',
                    icon: 'users'
                };
            }
        }

        // Available
        return {
            className: 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-gold-500 hover:text-white hover:shadow-gold-500/10',
            animation: '',
            icon: null
        };
    }
}
