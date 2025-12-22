import React from 'react';
import { OrderStatus } from '../../types';
import { Badge } from '../ui/Badge';
import { Clock, ChefHat, CheckCircle2, Bike, AlertCircle, Ban, Zap } from 'lucide-react';

interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ status, className = '' }) => {
  const getBadgeConfig = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.DRAFT:
        return { variant: 'default' as const, label: 'Draft', icon: <Clock size={12} /> };
      case OrderStatus.NEW:
        return { variant: 'info' as const, label: 'New', icon: <Zap size={12} /> };
      case OrderStatus.COOKING:
        return { variant: 'warning' as const, label: 'Cooking', icon: <ChefHat size={12} className="animate-bounce" /> };
      case OrderStatus.READY:
        return { variant: 'success' as const, label: 'Ready', icon: <CheckCircle2 size={12} /> };
      case OrderStatus.OUT_FOR_DELIVERY:
        return { variant: 'info' as const, label: 'In Transit', icon: <Bike size={12} /> };
      case OrderStatus.DELIVERED:
        return { variant: 'success' as const, label: 'Delivered', icon: <CheckCircle2 size={12} /> };
      case OrderStatus.PAID:
        return { variant: 'success' as const, label: 'Paid', icon: <CheckCircle2 size={12} /> };
      case OrderStatus.CANCELLED:
        return { variant: 'danger' as const, label: 'Cancelled', icon: <AlertCircle size={12} /> };
      case OrderStatus.VOID:
        return { variant: 'default' as const, label: 'Void', icon: <Ban size={12} /> };
      default:
        return { variant: 'default' as const, label: status, icon: null };
    }
  };

  const { variant, label, icon } = getBadgeConfig(status);

  return (
    <Badge variant={variant} className={`flex items-center gap-1.5 ${className}`}>
      {icon}
      <span>{label}</span>
    </Badge>
  );
};