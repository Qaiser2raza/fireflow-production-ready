import React from 'react';
import { Bell, DollarSign, Clock, AlertCircle } from 'lucide-react';

interface Notification {
    id: string;
    type: 'bill_request' | 'order_ready' | 'alert' | 'info';
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
}

interface NotificationCenterProps {
    notifications: Notification[];
    onMarkAsRead: (id: string) => void;
    onClearAll: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
    notifications,
    onMarkAsRead,
    onClearAll
}) => {
    const unreadCount = notifications.filter(n => !n.read).length;

    const getIcon = (type: Notification['type']) => {
        switch (type) {
            case 'bill_request':
                return <DollarSign size={16} className="text-yellow-500" />;
            case 'order_ready':
                return <Bell size={16} className="text-green-500" />;
            case 'alert':
                return <AlertCircle size={16} className="text-red-500" />;
            default:
                return <Bell size={16} className="text-blue-500" />;
        }
    };

    return (
        <div className="absolute right-0 top-full mt-2 w-96 bg-[#0B0F19] border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div>
                    <h3 className="text-white font-bold text-sm">Notifications</h3>
                    {unreadCount > 0 && (
                        <p className="text-xs text-slate-500">{unreadCount} unread</p>
                    )}
                </div>
                {notifications.length > 0 && (
                    <button
                        onClick={onClearAll}
                        className="text-xs text-red-400 hover:text-red-300 font-semibold"
                    >
                        Clear All
                    </button>
                )}
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        <Bell size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No notifications</p>
                    </div>
                ) : (
                    notifications.map(notification => (
                        <div
                            key={notification.id}
                            onClick={() => onMarkAsRead(notification.id)}
                            className={`px-4 py-3 border-b border-slate-800/50 hover:bg-slate-900/50 cursor-pointer transition-colors ${!notification.read ? 'bg-slate-900/30' : ''
                                }`}
                        >
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5">{getIcon(notification.type)}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-white text-sm font-semibold truncate">
                                            {notification.title}
                                        </h4>
                                        {!notification.read && (
                                            <div className="w-2 h-2 bg-gold-500 rounded-full shrink-0"></div>
                                        )}
                                    </div>
                                    <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">
                                        {notification.message}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <Clock size={10} className="text-slate-600" />
                                        <span className="text-[10px] text-slate-600">
                                            {new Date(notification.timestamp).toLocaleTimeString('en-US', {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
