import React from 'react';
import { Bell, Banknote, Clock, Utensils } from 'lucide-react';
import { Staff } from '../../shared/types';

interface RoleContextBarProps {
    currentUser: Staff | null;
    pendingBills?: number;
    activeTables?: number;
    pendingOrders?: number;
    cashInHand?: number;
    connectionStatus?: 'connected' | 'reconnecting' | 'disconnected';
}

export const RoleContextBar: React.FC<RoleContextBarProps> = ({
    currentUser,
    pendingBills = 0,
    activeTables = 0,
    pendingOrders = 0,
    connectionStatus,
}) => {
    if (!currentUser) return null;

    const renderCashierContext = () => (
        <>
            {pendingBills > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <Banknote size={16} className="text-yellow-500" />
                    <span className="text-xs font-semibold text-yellow-400">
                        {pendingBills} Bill Request{pendingBills !== 1 ? 's' : ''} Pending
                    </span>
                </div>
            )}
        </>
    );

    const renderServerContext = () => (
        <>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <Utensils size={16} className="text-blue-500" />
                <span className="text-xs font-semibold text-blue-400">
                    Active Tables: {activeTables}
                </span>
            </div>
            {activeTables > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 border border-slate-700/50 rounded-lg">
                    <Clock size={14} className="text-orange-500" />
                    <span className="text-xs text-slate-400">
                        Check tables for updates
                    </span>
                </div>
            )}
        </>
    );

    const renderChefContext = () => (
        <>
            {pendingOrders > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg animate-pulse">
                    <Bell size={16} className="text-red-500" />
                    <span className="text-xs font-semibold text-red-400">
                        {pendingOrders} Order{pendingOrders !== 1 ? 's' : ''} Pending
                    </span>
                </div>
            )}
        </>
    );

    const role = currentUser.role;

    // Determine if we have anything to show
    const hasContent =
        ((role === 'CASHIER' || role === 'MANAGER') && pendingBills > 0) ||
        (role === 'SERVER') ||
        (role === 'CHEF' && pendingOrders > 0);

    if (!hasContent) return null;

    return (
        <div className="bg-[#0B0F19]/80 border-b border-slate-800/50 px-6 py-2.5 flex items-center gap-3 animate-in slide-in-from-top-2 duration-200">
            {(role === 'CASHIER' || role === 'MANAGER') && renderCashierContext()}
            {role === 'SERVER' && renderServerContext()}
            {role === 'CHEF' && renderChefContext()}

            {/* Feature 3: Bilingual Connection Status */}
            {connectionStatus && (
                <div className="flex-1 flex justify-end">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border backdrop-blur-md transition-all duration-500 ${
                        connectionStatus === 'connected' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                        connectionStatus === 'reconnecting' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                        'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${
                            connectionStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' :
                            connectionStatus === 'reconnecting' ? 'bg-yellow-500 animate-pulse shadow-[0_0_8px_rgba(234,179,8,0.6)]' :
                            'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                        }`} />
                        <span className="text-[9px] font-black uppercase tracking-[0.1em]">
                            {connectionStatus === 'connected' ? 'Live / آن لائن' :
                             connectionStatus === 'reconnecting' ? 'Reconnecting / دوبارہ جڑ رہا ہے' :
                             'Offline / آف لائن'}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
