import React from 'react';
import { Clock, CreditCard, ChevronRight, Phone, MapPin } from 'lucide-react';
import { Order, OrderStatus, PaymentStatus } from '../../../shared/types';
import { useAppContext } from '../../../client/App';

interface OrderDetailProps {
    order: Order;
}

export const OrderDetail: React.FC<OrderDetailProps> = ({ order }) => {
    const { updateOrderStatus } = useAppContext();

    const orderItems = order.order_items || [];

    // Derived Data
    const customerName = order.customer_name || (order.dine_in_orders?.[0] ? 'Dine In Guest' : 'Walk-in');
    const tableId = order.dine_in_orders?.[0]?.table_id;
    const isPaid = order.payment_status === PaymentStatus.PAID;

    // Helpers
    const getTargetStatus = (current: OrderStatus): OrderStatus | null => {
        if (current === OrderStatus.ACTIVE) return OrderStatus.READY;
        if (current === OrderStatus.READY) return OrderStatus.CLOSED;
        return null;
    };

    const nextStatus = getTargetStatus(order.status);

    const handleAdvance = async () => {
        if (nextStatus) {
            await updateOrderStatus(order.id, nextStatus);
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-950/50 backdrop-blur-sm">
            {/* Header */}
            <div className={`p-8 border-b border-slate-800 ${order.status === 'READY' ? 'bg-gold-500/10' : ''}`}>
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest ${order.type === 'DELIVERY' ? 'bg-blue-500 text-white' : 'bg-gold-500 text-black'}`}>
                                {order.type}
                            </span>
                            <span className="text-slate-500 font-mono text-xs">#{order.id.split('-').pop()}</span>
                        </div>
                        <h1 className="text-4xl font-black text-white tracking-tighter uppercase">{customerName}</h1>
                        {tableId && <div className="text-gold-500 font-bold mt-1 text-lg">TABLE {tableId}</div>}
                    </div>

                    <div className="text-right">
                        <div className="text-6xl font-black text-white tracking-tighter">
                            <span className="text-2xl text-slate-500 mr-2 align-top mt-2 inline-block">Rs.</span>
                            {order.total.toLocaleString()}
                        </div>
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase mt-2 ${isPaid ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-500'}`}>
                            {isPaid ? <CreditCard size={12} /> : <Clock size={12} />}
                            {isPaid ? 'PAID' : 'PAYMENT PENDING'}
                        </div>
                    </div>
                </div>

                {/* Customer Info Bar (If applicable) */}
                {(order.customer_phone || order.delivery_address) && (
                    <div className="flex gap-6 mt-4 pt-4 border-t border-slate-800/50">
                        {order.customer_phone && (
                            <div className="flex items-center gap-2 text-slate-400">
                                <Phone size={14} /> <span className="text-xs font-mono">{order.customer_phone}</span>
                            </div>
                        )}
                        {order.delivery_address && (
                            <div className="flex items-center gap-2 text-slate-400">
                                <MapPin size={14} /> <span className="text-xs">{order.delivery_address}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="space-y-1">
                    {orderItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center py-4 border-b border-slate-800 group hover:bg-slate-900/50 px-4 -mx-4 rounded-lg transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="size-8 rounded bg-slate-800 flex items-center justify-center text-slate-400 font-bold">
                                    {item.quantity}
                                </div>
                                <div>
                                    <div className="text-lg font-bold text-white">{item.menu_item?.name || item.menu_item_id}</div>
                                    <div className="text-xs text-slate-500 uppercase tracking-widest">{item.item_status}</div>
                                </div>
                            </div>
                            <div className="font-mono text-slate-400">
                                {(item.unit_price * item.quantity).toLocaleString()}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Action Footer */}
            <div className="p-8 border-t border-slate-800 bg-slate-900/30">
                <div className="flex gap-4">
                    {nextStatus && (
                        <button
                            onClick={handleAdvance}
                            className="flex-1 h-16 bg-white text-black rounded-xl font-black text-lg tracking-widest uppercase hover:bg-gold-500 transition-colors flex items-center justify-center gap-3"
                        >
                            <span>Mark as {nextStatus}</span>
                            <ChevronRight size={20} />
                        </button>
                    )}

                    {!nextStatus && !isPaid && (
                        <button className="flex-1 h-16 bg-green-600 text-white rounded-xl font-black text-lg tracking-widest uppercase hover:bg-green-500 transition-colors">
                            Settle Payment
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
