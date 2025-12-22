
import React from 'react';
import { Order, OrderStatus, OrderType } from '../../types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { OrderStatusBadge } from './OrderStatusBadge';
import { OrderItemsList } from './OrderItemsList';
import { OrderSummary } from './OrderSummary';
import { 
  Utensils, 
  ShoppingBag, 
  Truck, 
  Edit2, 
  X, 
  Clock, 
  User, 
  Users, 
  Phone, 
  MapPin,
  ClipboardList
} from 'lucide-react';

interface OrderCardProps {
  order: Order;
  variant?: 'compact' | 'detailed';
  onClick?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onStatusChange?: (newStatus: OrderStatus) => void;
  showActions?: boolean;
  className?: string;
}

export const OrderCard: React.FC<OrderCardProps> = ({
  order,
  variant = 'compact',
  onClick,
  onEdit,
  onCancel,
  onStatusChange,
  showActions = false,
  className = ''
}) => {
  const isDetailed = variant === 'detailed';

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMins = Math.floor(diffInMs / (1000 * 60));

    if (diffInMins < 1) return 'Just now';
    if (diffInMins < 60) return `${diffInMins} mins ago`;
    
    const isToday = now.toDateString() === date.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
  };

  const getTypeConfig = (type: OrderType) => {
    switch (type) {
      case 'dine-in':
        return { variant: 'info' as const, icon: <Utensils size={10} />, label: 'Dine-in' };
      case 'takeaway':
        return { variant: 'warning' as const, icon: <ShoppingBag size={10} />, label: 'Takeaway' };
      case 'delivery':
        return { variant: 'success' as const, icon: <Truck size={10} />, label: 'Delivery' };
    }
  };

  const typeConfig = getTypeConfig(order.type);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  const renderStatusAction = () => {
    if (!onStatusChange) return null;

    switch (order.status) {
      case OrderStatus.NEW:
        return (
          <Button variant="primary" size="sm" onClick={() => onStatusChange(OrderStatus.COOKING)}>
            Start Cooking
          </Button>
        );
      case OrderStatus.COOKING:
        return (
          <Button variant="success" size="sm" onClick={() => onStatusChange(OrderStatus.READY)}>
            Mark Ready
          </Button>
        );
      case OrderStatus.READY:
        if (order.type === 'delivery') {
          return (
            /* Fix: Changed variant="info" to variant="primary" because "info" is not a valid variant for the Button component */
            <Button variant="primary" size="sm" onClick={() => onStatusChange(OrderStatus.OUT_FOR_DELIVERY)}>
              Ship Order
            </Button>
          );
        }
        return (
          <Badge variant="warning">Ready for Pay</Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card 
      className={`${onClick ? 'cursor-pointer hover:border-gold-500/50' : ''} ${className}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4 gap-4">
        <div className="space-y-1">
          <div className="text-gold-500 font-mono font-bold text-sm tracking-tight">
            #{order.id.split('-').pop() || order.id.substring(0, 8)}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={typeConfig.variant} className="flex items-center gap-1">
              {typeConfig.icon}
              <span>{typeConfig.label}</span>
            </Badge>
            <OrderStatusBadge status={order.status} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-white font-serif font-bold text-lg">
            Rs. {Math.round(order.total).toLocaleString()}
          </div>
          <div className="flex items-center justify-end gap-1.5 text-slate-500 text-[10px] uppercase font-bold tracking-wider mt-1">
            <Clock size={10} />
            {formatTimestamp(order.timestamp)}
          </div>
        </div>
      </div>

      {/* Main Info Body */}
      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <h4 className="text-white font-medium text-base">
              {order.type === 'dine-in' ? `Table ${order.tableId || '---'}` : order.customerName || 'Walk-in'}
            </h4>
            <p className="text-slate-500 text-xs flex items-center gap-1.5 mt-0.5 font-bold uppercase tracking-widest">
              <ClipboardList size={12} className="text-slate-600" />
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </p>
          </div>
          {order.type === 'dine-in' && order.guestCount && (
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold bg-slate-950 px-2 py-1 rounded border border-slate-800">
              <Users size={12} />
              {order.guestCount}p
            </div>
          )}
        </div>

        {/* Detailed Section */}
        {isDetailed && (
          <div className="space-y-4 pt-4 border-t border-slate-800 animate-in fade-in slide-in-from-top-2">
            {/* Meta Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {order.customerPhone && (
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Contact</label>
                  <div className="text-slate-300 text-sm flex items-center gap-2">
                    <Phone size={12} className="text-gold-500" />
                    {order.customerPhone}
                  </div>
                </div>
              )}
              {order.deliveryAddress && (
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Address</label>
                  <div className="text-slate-300 text-sm flex items-center gap-2">
                    <MapPin size={12} className="text-gold-500 shrink-0" />
                    <span className="line-clamp-1">{order.deliveryAddress}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Items List */}
            <OrderItemsList 
              items={order.items} 
              showStatus={true} 
              showPrices={true}
              className="bg-slate-950/30" 
            />

            {/* Financial Summary */}
            {order.breakdown && (
              <OrderSummary 
                breakdown={order.breakdown} 
                type={order.type} 
                className="bg-transparent border-none p-0" 
              />
            )}
          </div>
        )}
      </div>

      {/* Actions Footer */}
      {showActions && (
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-800">
          <div className="flex gap-2">
            {onEdit && (
              <Button variant="ghost" size="sm" icon={<Edit2 size={14} />} onClick={onEdit}>
                Edit
              </Button>
            )}
            {onCancel && (
              <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-500/10 hover:text-red-400" icon={<X size={14} />} onClick={onCancel}>
                Void
              </Button>
            )}
          </div>
          <div className="flex items-center">
            {renderStatusAction()}
          </div>
        </div>
      )}
    </Card>
  );
};
