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
}) => {
    const imgUrl = item.image || item.image_url;
    const isAvailable = item.is_available ?? item.available ?? true;

    return (
        <div
            onClick={() => isAvailable && onSelect(item)}
            className="group relative bg-[#0B1120] rounded-2xl overflow-hidden cursor-pointer border border-white/5 hover:border-gold-500/40 transition-all duration-300 flex flex-col active:scale-95 h-full shadow-lg"
        >
            {/* Image Section */}
            <div className="aspect-[4/3] w-full relative bg-slate-700 overflow-hidden shrink-0">
                <img
                    src={imgUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80'}
                    alt={item.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.onerror = null; // Prevent infinite loop
                        target.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80';
                    }}
                />

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

            {/* Info Section */}
            <div className="p-2 md:p-3 bg-gradient-to-b from-[#0B1120] to-black/40 flex flex-col gap-1 flex-1 justify-between">
                <div>
                    <h3 className="text-white font-black text-[10px] md:text-xs leading-tight uppercase tracking-tight group-hover:text-gold-500 transition-colors truncate">
                        {item.name}
                    </h3>
                    <p className="font-urdu text-xl text-white font-bold leading-none mt-2 truncate drop-shadow-md" dir="rtl">
                        {item.name_urdu || 'بغیر نام'}
                    </p>
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gold-500/80 bg-gold-500/5 px-2 py-0.5 rounded shadow-sm">
                        {item.category || 'General'}
                    </span>
                    {item.station && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400/60 font-mono">
                            {item.station}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
