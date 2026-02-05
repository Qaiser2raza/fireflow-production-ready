import React from 'react';
import { Utensils } from 'lucide-react';
import { MenuItem } from '../../../shared/types';

interface MenuItemCardProps {
    item: MenuItem;
    onSelect: (item: MenuItem) => void;
    showCategory?: boolean; // Prop to make the card universal
}

/**
 * MenuItemCard - A standardized card for menu items.
 * Designed to be responsive, uniform in size, and visually consistent.
 */
export const MenuItemCard: React.FC<MenuItemCardProps> = ({
    item,
    onSelect,
    showCategory = false
}) => {
    const imgUrl = item.image || item.image_url;
    const hasValidUrl = typeof imgUrl === 'string' && imgUrl.includes('/');
    const isAvailable = item.is_available ?? item.available ?? true;

    return (
        <div
            onClick={() => isAvailable && onSelect(item)}
            className="group relative bg-[#0B1120] rounded-2xl overflow-hidden cursor-pointer border border-white/5 hover:border-gold-500/40 transition-all duration-300 flex flex-col active:scale-95 h-full shadow-lg"
        >
            {/* 
        Image Section 
        Uses aspect ratio (4:3) to ensure all cards have the same image dimensions.
        Brighter fallback background (bg-slate-700) for better visual consistency.
      */}
            <div className="aspect-[4/3] w-full relative bg-slate-700 overflow-hidden shrink-0">
                {hasValidUrl ? (
                    <img
                        src={imgUrl}
                        alt={item.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            const parent = (e.target as HTMLElement).parentElement;
                            if (parent) {
                                const placeholder = parent.querySelector('.placeholder-icon');
                                if (placeholder) placeholder.classList.remove('hidden');
                            }
                        }}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Utensils size={36} className="text-slate-400 opacity-60" />
                    </div>
                )}

                {/* Fallback Icon for broken images - Brighter & More Visible */}
                <div className="placeholder-icon absolute inset-0 hidden items-center justify-center pointer-events-none">
                    <Utensils size={36} className="text-slate-400 opacity-60" />
                </div>

                {/* Modern Price Badge */}
                <div className="absolute top-2 right-2 md:top-3 md:right-3 bg-black/80 backdrop-blur-md px-2 py-1 md:px-2.5 md:py-1.5 rounded-lg border border-white/10 shadow-xl z-20">
                    <span className="text-gold-500 font-black font-mono text-[9px] md:text-[11px] tracking-tight">
                        Rs. {Number(item.price).toLocaleString()}
                    </span>
                </div>

                {/* Availability Badge */}
                {!isAvailable && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10">
                        <div className="bg-red-600/90 text-white text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full shadow-lg">
                            Sold Out
                        </div>
                    </div>
                )}
            </div>

            {/* 
                Info Section 
                Standardized geometry with flexible name area and fixed category area to ensure PERFECT consistency.
            */}
            <div className="p-3 md:p-4 bg-[#0B1120] flex flex-col gap-1.5 flex-1 min-h-[100px] md:min-h-[120px]">
                {/* Item Name: Flexible but with min-height for baseline consistency */}
                <div className="min-h-[32px] md:min-h-[40px] flex items-start overflow-hidden">
                    <h3
                        className="text-white font-black text-xs md:text-[14px] leading-tight md:leading-snug uppercase tracking-tight group-hover:text-gold-500 transition-colors w-full"
                        style={{
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 2,
                            overflow: 'hidden'
                        }}
                    >
                        {item.name || 'Unknown Item'}
                    </h3>
                </div>

                {/* Categories: Reserved area to maintain vertical parity across all tabs */}
                <div className="h-4 mt-auto flex items-center">
                    {showCategory ? (
                        <div className="flex items-center gap-1.5">
                            <div className="w-1 h-1 rounded-full bg-gold-500/50" />
                            <span className="text-[8px] md:text-[9px] text-slate-500 font-extrabold uppercase tracking-[0.1em] opacity-80 truncate max-w-[120px]">
                                {item.category || item.category_rel?.name || 'General'}
                            </span>
                        </div>
                    ) : (
                        /* Invisible spacer keeps cards exactly the same height in category-specific views */
                        <div className="h-4" />
                    )}
                </div>
            </div>
        </div>
    );
};
