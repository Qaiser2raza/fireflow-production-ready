import React from 'react';
import { ShoppingBag, ChevronUp } from 'lucide-react';

interface FloatingCartBadgeProps {
    itemCount: number;
    total: number;
    onClick: () => void;
    isOpen?: boolean;
    onClose?: () => void;
}

/**
 * FloatingCartBadge - Mobile floating button showing cart summary
 * Appears at bottom-right, shows item count and total
 * Click to expand cart panel
 */
export const FloatingCartBadge: React.FC<FloatingCartBadgeProps> = ({
    itemCount,
    total,
    onClick,
    isOpen = false,
}) => {
    if (itemCount === 0) return null;

    return (
        <button
            onClick={onClick}
            className={`fixed bottom-6 right-6 z-40 transform transition-all duration-300 ${
                isOpen ? 'scale-95 opacity-70' : 'scale-100 opacity-100'
            }`}
        >
            {/* Animated Badge */}
            <div className="relative">
                {/* Glow */}
                <div className="absolute inset-0 bg-green-500/30 rounded-full blur-xl animate-pulse" />
                
                {/* Main Button */}
                <div className="relative w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 rounded-full shadow-2xl flex items-center justify-center cursor-pointer transition-all hover:scale-110 border-2 border-green-400/30">
                    <div className="flex flex-col items-center">
                        <ShoppingBag size={20} className="text-white" />
                        <span className="text-[10px] font-bold text-white mt-px">{itemCount}</span>
                    </div>
                </div>

                {/* Item Count Badge */}
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center border-2 border-white shadow-lg animate-bounce">
                    <span className="text-white font-black text-xs">{itemCount}</span>
                </div>

                {/* Total Display */}
                <div className="absolute bottom-full mb-3 right-0 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-bold text-center whitespace-nowrap shadow-xl pointer-events-none">
                    <div className="text-gold-500 font-mono">Rs. {total.toLocaleString()}</div>
                    <div className="text-[9px] text-slate-400">{itemCount} item{itemCount !== 1 ? 's' : ''}</div>
                </div>

                {/* Chevron indicator */}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-green-400 animate-bounce">
                    <ChevronUp size={16} />
                </div>
            </div>
        </button>
    );
};