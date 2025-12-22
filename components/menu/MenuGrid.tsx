import React from 'react';
import { MenuItem } from '../../types';
import { MenuItemCard } from './MenuItemCard';
import { ChefHat, SearchX, Loader2 } from 'lucide-react';

interface MenuGridProps {
  items: MenuItem[];
  onSelectItem: (item: MenuItem) => void;
  columns?: 3 | 4 | 5;
  editable?: boolean;
  onEditItem?: (item: MenuItem) => void;
  onDeleteItem?: (id: string) => void;
  onToggleAvailability?: (id: string) => void;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

export const MenuGrid: React.FC<MenuGridProps> = ({
  items,
  onSelectItem,
  columns = 4,
  editable = false,
  onEditItem,
  onDeleteItem,
  onToggleAvailability,
  loading = false,
  emptyMessage = "No items found in this section.",
  className = ''
}) => {
  // Defensive check for items list (filter out unavailable items for POS if not editable)
  const displayItems = editable ? items : items.filter(i => i.available);

  const gridCols = {
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
  };

  if (loading) {
    return (
      <div className={`grid ${gridCols[columns]} gap-6 ${className}`}>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-xl h-64 animate-pulse overflow-hidden">
            <div className="h-44 bg-slate-800/50" />
            <div className="p-4 space-y-3">
              <div className="h-4 bg-slate-800 rounded w-3/4" />
              <div className="h-3 bg-slate-800 rounded w-1/2 opacity-50" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-700 gap-6 animate-in fade-in duration-700">
        <div className="p-10 bg-slate-900 rounded-full border border-slate-800">
           <SearchX size={64} className="opacity-10" />
        </div>
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.4em] mb-2">Workspace Empty</p>
          <p className="text-xs italic opacity-60 max-w-xs">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid ${gridCols[columns]} gap-6 ${className}`}>
      {displayItems.map((item) => (
        <MenuItemCard
          key={item.id}
          item={item}
          onSelect={() => onSelectItem(item)}
          editable={editable}
          onEdit={() => onEditItem?.(item)}
          onDelete={() => onDeleteItem?.(item.id)}
          onToggleAvailability={() => onToggleAvailability?.(item.id)}
          compact={columns === 5}
        />
      ))}
    </div>
  );
};