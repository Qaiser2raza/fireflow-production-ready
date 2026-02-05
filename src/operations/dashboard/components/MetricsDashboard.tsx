import React, { useMemo } from 'react';
import { DollarSign, Users, ChefHat, Clock, FileText } from 'lucide-react';
import { Order, Table, Staff } from '../../../shared/types';

interface MetricsDashboardProps {
    orders: Order[];
    tables: Table[];
    currentUser: Staff | null;
    onDraftClick?: () => void;
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ orders, tables, currentUser, onDraftClick }) => {
    const metrics = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Revenue: Today's total from all non-cancelled orders
        const todaysOrders = orders.filter(o => {
            const orderDate = new Date(o.created_at);
            return orderDate >= today && o.status !== 'CANCELLED';
        });
        const revenue = todaysOrders.reduce((sum, o) => sum + (o.total || 0), 0);

        // Active Tables %
        const occupiedCount = tables.filter(t => t.status === 'OCCUPIED').length;
        const totalTables = tables.filter(t => !t.is_virtual && t.is_active !== false).length;
        const activePercentage = totalTables > 0 ? Math.round((occupiedCount / totalTables) * 100) : 0;

        // Pending KDS: Orders in FIRED or PREPARING state
        const pendingKDS = orders.filter(o =>
            o.status === 'FIRED' || o.status === 'PREPARING'
        ).length;

        // Avg Turn Time: Average duration of completed orders today
        const completedToday = todaysOrders.filter(o =>
            o.status === 'PAID' || o.status === 'COMPLETED'
        );
        const avgTurnTime = completedToday.length > 0
            ? Math.round(
                completedToday.reduce((sum, o) => {
                    const created = new Date(o.created_at).getTime();
                    const updated = new Date(o.updated_at).getTime();
                    return sum + (updated - created);
                }, 0) / completedToday.length / 60000
            )
            : 0;

        // Draft Orders: Orders saved but not fired yet
        const draftOrders = orders.filter(o => o.status === 'DRAFT').length;

        return { revenue, activePercentage, pendingKDS, avgTurnTime, draftOrders };
    }, [orders, tables]);

    // Role-based visibility
    const canSeeRevenue = currentUser?.role === 'MANAGER' || currentUser?.role === 'CASHIER';

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 py-3 bg-[#0a0e1a] border-b border-slate-800/50">
            {/* Revenue - Only for Manager/Cashier */}
            {canSeeRevenue && (
                <MetricCard
                    icon={DollarSign}
                    label="REVENUE"
                    value={`$${metrics.revenue.toLocaleString()}`}
                    colorClass="border-gold-500/30 bg-gold-500/5"
                    iconColor="text-gold-500"
                />
            )}

            {/* Active Tables % */}
            <MetricCard
                icon={Users}
                label="ACTIVE TBLS"
                value={`${metrics.activePercentage}%`}
                colorClass="border-blue-500/30 bg-blue-500/5"
                iconColor="text-blue-500"
            />

            {/* Pending KDS */}
            <MetricCard
                icon={ChefHat}
                label="PENDING KDS"
                value={metrics.pendingKDS.toString()}
                colorClass="border-red-500/30 bg-red-500/5"
                iconColor="text-red-500"
            />

            {/* Avg Turn Time */}
            <MetricCard
                icon={Clock}
                label="AVG TURN"
                value={`${metrics.avgTurnTime}m`}
                colorClass="border-green-500/30 bg-green-500/5"
                iconColor="text-green-500"
            />

            {/* Draft Orders - Clickable */}
            <MetricCard
                icon={FileText}
                label="DRAFTS"
                value={metrics.draftOrders.toString()}
                colorClass="border-blue-500/30 bg-blue-500/5"
                iconColor="text-blue-500"
                onClick={onDraftClick}
                clickable
            />
        </div>
    );
};

interface MetricCardProps {
    icon: React.ElementType;
    label: string;
    value: string;
    colorClass: string;
    iconColor: string;
    onClick?: () => void;
    clickable?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ icon: Icon, label, value, colorClass, iconColor, onClick, clickable }) => {
    return (
        <div
            className={`p-3 rounded-lg border ${colorClass} flex flex-col ${clickable ? 'cursor-pointer hover:scale-105 transition-transform active:scale-95' : ''}`}
            onClick={clickable ? onClick : undefined}
        >
            <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</span>
                <Icon size={14} className={iconColor} />
            </div>
            <div className="text-2xl font-black text-white leading-none">{value}</div>
        </div>
    );
};
