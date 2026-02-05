
import React, { useState } from 'react';
import { AlertCircle, Users, CheckCircle } from 'lucide-react';
import { OrderStatus } from '../types';

interface GuestCountInputProps {
    orderId: string;
    currentGuestCount: number;
    tableCapacity: number;
    orderStatus: OrderStatus | string;
    history?: any[]; // Array of { count, timestamp, staff_id, over_capacity }
    onUpdate: (guestCount: number) => Promise<void>;
}

export const GuestCountInput: React.FC<GuestCountInputProps> = ({
    orderId,
    currentGuestCount,
    tableCapacity,
    orderStatus,
    history = [],
    onUpdate
}) => {
    const [guests, setGuests] = useState(currentGuestCount);
    const [warning, setWarning] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const closedStatuses: (OrderStatus | string)[] = [OrderStatus.COMPLETED, OrderStatus.PAID, OrderStatus.CANCELLED, OrderStatus.VOID, 'VOIDED', 'COMPLETED', 'PAID'];
    const isLocked = closedStatuses.includes(orderStatus);

    const handleChange = (newGuests: number) => {
        if (newGuests < 1) return;

        setGuests(newGuests);

        if (newGuests > tableCapacity) {
            const extraChairs = newGuests - tableCapacity;
            setWarning(
                `Table capacity is ${tableCapacity} - ${extraChairs} extra chair${extraChairs > 1 ? 's' : ''} needed`
            );
            setShowConfirm(true);
        } else {
            setWarning('');
            setShowConfirm(false);
        }
    };

    const handleSave = async () => {
        setIsUpdating(true);
        try {
            await onUpdate(guests);
            setShowConfirm(false);
        } catch (error) {
            console.error('Failed to update guest count:', error);
            // Rollback to original value
            setGuests(currentGuestCount);
        } finally {
            setIsUpdating(false);
        }
    };

    const isOverCapacity = guests > tableCapacity;
    const isWithinCapacity = guests <= tableCapacity;

    return (
        <div className="flex flex-col gap-2">
            {/* Input Row */}
            <div className="flex items-center gap-3">
                <label className="text-sm text-slate-400 flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    Guests
                </label>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => handleChange(guests - 1)}
                        disabled={isLocked || guests <= 1}
                        className="w-8 h-8 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 
                       disabled:cursor-not-allowed rounded-lg text-white font-bold flex items-center justify-center"
                    >
                        -
                    </button>

                    <input
                        type="number"
                        value={guests}
                        onChange={(e) => handleChange(Number(e.target.value))}
                        className={`
              w-16 text-center bg-slate-800 text-white p-2 rounded-lg
              border-2 transition-colors outline-none
              ${isOverCapacity ? 'border-amber-500' : 'border-slate-700 focus:border-blue-500'}
              ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}
            `}
                        min={1}
                        disabled={isLocked}
                    />

                    <button
                        onClick={() => handleChange(guests + 1)}
                        disabled={isLocked}
                        className="w-8 h-8 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 
                       disabled:cursor-not-allowed rounded-lg text-white font-bold flex items-center justify-center"
                    >
                        +
                    </button>
                </div>

                {/* Capacity Indicator */}
                <div className="flex items-center gap-1 text-xs">
                    {isWithinCapacity ? (
                        <span className="text-emerald-500 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Within capacity ({tableCapacity})
                        </span>
                    ) : (
                        <span className="text-amber-500 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {guests - tableCapacity} over capacity
                        </span>
                    )}
                </div>
            </div>

            {/* Warning Banner */}
            {warning && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg animate-fade-in">
                    <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm text-amber-500 font-medium">{warning}</p>
                        <p className="text-xs text-amber-400 mt-1">
                            This will be logged for review. Confirm if extra seating is available.
                        </p>
                    </div>
                </div>
            )}

            {/* Confirm Button (only when over capacity and unsaved) */}
            {showConfirm && guests !== currentGuestCount && (
                <button
                    onClick={handleSave}
                    disabled={isUpdating}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg
                     font-medium disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors flex items-center justify-center gap-2"
                >
                    {isUpdating ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Updating...
                        </>
                    ) : (
                        `Confirm ${guests} Guests`
                    )}
                </button>
            )}

            {/* Guest Arrival History */}
            {history.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Guest Activity Log</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                        {history.map((entry, i) => (
                            <div key={i} className="flex items-center justify-between text-[11px] bg-slate-900/50 p-2 rounded border border-slate-800/50">
                                <div className="flex items-center gap-2">
                                    <span className={`w-5 h-5 rounded flex items-center justify-center font-bold ${entry.over_capacity ? 'bg-amber-900/30 text-amber-500' : 'bg-slate-800 text-slate-300'}`}>
                                        {entry.count}
                                    </span>
                                    <span className="text-slate-400">guests seated</span>
                                </div>
                                <div className="text-right">
                                    <div className="text-slate-500">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    <div className="text-[9px] text-slate-600 uppercase">by Staff ID: {entry.staff_id?.split('-')[0] || 'SYSTEM'}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Locked Message */}
            {isLocked && (
                <p className="text-xs text-slate-500">
                    Guest count locked - order status is {orderStatus}
                </p>
            )}
        </div>
    );
};
