import React, { useState, useMemo, useEffect } from 'react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';
import { 
    X, Printer, Edit2, Clock, 
    Phone, ShoppingBag, Utensils, Bike, 
    AlertCircle, SearchIcon, Calendar
} from 'lucide-react';
import { Order } from '../../../shared/types';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Input } from '../../../shared/ui/Input';

interface RecentOrdersModalProps {
    isOpen: boolean;
    onClose: () => void;
    orders: Order[];
    activeSession: any;
    onEditOrder: (order: Order) => void;
    onPrintReceipt: (order: Order) => void;
}

export const RecentOrdersModal: React.FC<RecentOrdersModalProps> = ({
    isOpen, onClose, orders, activeSession, onEditOrder, onPrintReceipt
}) => {
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'READY' | 'CLOSED'>('ALL');
    const [localOrders, setLocalOrders] = useState<Order[]>(orders);
    const [, setRefreshing] = useState(false);

    const refreshOrders = async () => {
        setRefreshing(true);
        try {
            const res = await fetchWithAuth('/api/orders');
            if (res.ok) {
                const data = await res.json();
                setLocalOrders(data);
            }
        } catch (err) {
            // Fallback to prop data silently
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            setLocalOrders(orders); // Seed with prop data immediately
            refreshOrders();        // Then fetch fresh data in background
        }
    }, [isOpen]);

    const filteredOrders = useMemo(() => {
        return localOrders
            .filter(o => {
                // 1. Filter by Active Session (only show orders created after session opened)
                if (activeSession?.opened_at) {
                    const sessionStart = new Date(activeSession.opened_at).getTime();
                    const orderTime = new Date(o.created_at || 0).getTime();
                    if (orderTime < sessionStart) return false;
                }
                
                // 2. Filter by search (Order # or Phone)
                const searchLower = search.toLowerCase();
                const matchesSearch = 
                    o.order_number?.toLowerCase().includes(searchLower) ||
                    o.customer_phone?.includes(search) ||
                    o.id.split('-').pop()?.toLowerCase().includes(searchLower);
                
                if (search && !matchesSearch) return false;

                // 3. Status filter
                if (filterStatus !== 'ALL' && o.status !== filterStatus) return false;

                return true;
            })
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    }, [localOrders, activeSession, search, filterStatus]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <Card className="w-full max-w-5xl h-[85vh] bg-slate-900 border-slate-800 flex flex-col overflow-hidden shadow-2xl rounded-[2rem]">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gold-500/10 rounded-xl border border-gold-500/20">
                            <Clock className="w-6 h-6 text-gold-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white uppercase tracking-tight">Shift Inventory Recall</h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                                Session #{activeSession?.id?.split('-').pop()?.toUpperCase()} · Opened {new Date(activeSession?.opened_at).toLocaleTimeString()}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Controls Bar */}
                <div className="p-4 bg-slate-950/30 border-b border-slate-800 flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1 group">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-gold-500 transition-colors" />
                        <Input 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Find by Order # or Customer Phone..." 
                            className="pl-10 h-11 bg-slate-900/50 border-slate-800 group-focus-within:border-gold-500/50 transition-all text-sm"
                        />
                    </div>
                    <div className="flex gap-2">
                        {(['ALL', 'ACTIVE', 'READY', 'CLOSED'] as const).map(status => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                                    filterStatus === status 
                                    ? 'bg-gold-500 text-slate-950 border-gold-500 shadow-lg shadow-gold-500/20' 
                                    : 'bg-slate-800/50 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                                }`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Orders Grid */}
                <div className="flex-1 overflow-y-auto p-6 bg-[#020617] custom-scrollbar">
                    {filteredOrders.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredOrders.map(order => (
                                <OrderCard 
                                    key={order.id} 
                                    order={order} 
                                    onEdit={() => onEditOrder(order)}
                                    onPrint={() => onPrintReceipt(order)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
                            <AlertCircle size={64} className="text-slate-600 mb-4" />
                            <h3 className="text-2xl font-serif text-slate-500 italic">No orders found</h3>
                            <p className="text-[10px] uppercase font-black tracking-widest text-slate-600 mt-2">Try adjusting your filters or search query</p>
                        </div>
                    )}
                </div>
                
                {/* Stats Footer */}
                <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Orders in Shift</span>
                            <span className="text-lg font-black text-white">{filteredOrders.length}</span>
                        </div>
                        <div className="w-px h-8 bg-slate-800" />
                        <div className="flex flex-col">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest text-gold-500">Shift Total</span>
                            <span className="text-lg font-black text-white font-mono">Rs. {filteredOrders.reduce((sum, o) => sum + Number(o.total), 0).toLocaleString()}</span>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="ghost" size="sm" className="text-[10px] uppercase font-black tracking-widest text-slate-400">
                            <Calendar size={12} className="mr-2" /> Daily Report
                        </Button>
                        <Button variant="secondary" size="sm" className="text-[10px] uppercase font-black tracking-widest">
                            Sync Now
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};

const OrderCard: React.FC<{ order: Order, onEdit: () => void, onPrint: () => void }> = ({ order, onEdit, onPrint }) => {

    
    const getIcon = () => {
        if (order.type === 'DINE_IN') return <Utensils className="w-4 h-4" />;
        if (order.type === 'TAKEAWAY') return <ShoppingBag className="w-4 h-4" />;
        return <Bike className="w-4 h-4" />;
    };

    const statusColors = {
        'ACTIVE': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        'READY': 'bg-green-500/20 text-green-400 border-green-500/30',
        'CLOSED': 'bg-slate-800 text-slate-400 border-slate-700',
        'CANCELLED': 'bg-red-500/20 text-red-400 border-red-500/30',
        'VOIDED': 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    };

    return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-all group hover:bg-slate-900/80">
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
                        {getIcon()}
                    </div>
                    <div>
                        <div className="text-xs font-black text-white tracking-widest">#{order.order_number || order.id.split('-').pop()?.toUpperCase()}</div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{order.type} · {new Date(order.created_at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                </div>
                <div className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border ${statusColors[order.status as keyof typeof statusColors] || statusColors.ACTIVE}`}>
                    {order.status}
                </div>
            </div>

            <div className="flex justify-between items-end">
                <div>
                   <div className="text-lg font-black text-white italic tracking-tighter">Rs. {Number(order.total).toLocaleString()}</div>
                   <div className="text-[9px] text-slate-500 font-bold uppercase mt-1 flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                       <Phone size={10} className="text-gold-500" /> {order.customer_phone || 'Customer Guest'}
                   </div>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onPrint(); }}
                        className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center justify-center transition-all active:scale-90"
                        title="Reprint Receipt"
                    >
                        <Printer size={16} />
                    </button>
                    {order.status !== 'CLOSED' && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                            className="w-9 h-9 bg-gold-500 hover:bg-gold-400 text-slate-950 rounded-xl flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-gold-500/20"
                            title="Recall/Edit Order"
                        >
                            <Edit2 size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
