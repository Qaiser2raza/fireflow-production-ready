import React from 'react';
import { MenuItem } from '../../types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { 
  Edit2, 
  Trash2, 
  Users, 
  Flame, 
  Snowflake, 
  Wine, 
  Cake, 
  Zap, 
  Ban,
  Image as ImageIcon
} from 'lucide-react';

interface MenuItemCardProps {
  item: MenuItem;
  onSelect: () => void;
  editable?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleAvailability?: () => void;
  showPrice?: boolean;
  compact?: boolean;
  className?: string;
}

export const MenuItemCard: React.FC<MenuItemCardProps> = ({
  item,
  onSelect,
  editable = false,
  onEdit,
  onDelete,
  onToggleAvailability,
  showPrice = true,
  compact = false,
  className = ''
}) => {
  const getStationIcon = (station: string) => {
    switch (station) {
      case 'hot': return <Flame size={10} className="text-orange-500" />;
      case 'cold': return <Snowflake size={10} className="text-blue-400" />;
      case 'bar': return <Wine size={10} className="text-purple-400" />;
      case 'dessert': return <Cake size={10} className="text-pink-400" />;
      case 'tandoor': return <Zap size={10} className="text-yellow-500" />;
      default: return null;
    }
  };

  const getCategoryVariant = (cat: string) => {
    switch (cat) {
      case 'starters': return 'info';
      case 'mains': return 'warning';
      case 'beverages': return 'success';
      case 'desserts': return 'danger';
      default: return 'default';
    }
  };

  return (
    <Card 
      onClick={item.available || editable ? onSelect : undefined}
      className={`group relative flex flex-col p-0 overflow-hidden transition-all duration-300 active:scale-[0.98] ${
        !item.available && !editable ? 'opacity-60 grayscale cursor-not-allowed' : 'cursor-pointer hover:border-gold-500/50'
      } ${className}`}
    >
      {/* Availability Overlay for Non-Editable Mode */}
      {!item.available && !editable && (
        <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] z-20 flex items-center justify-center">
          <div className="bg-red-600 text-white px-3 py-1 rounded-full font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 shadow-xl">
            <Ban size={12} /> Sold Out
          </div>
        </div>
      )}

      {/* Image Section */}
      <div className={`relative ${compact ? 'h-32' : 'h-44'} w-full bg-slate-950 overflow-hidden border-b border-slate-800`}>
        {item.image ? (
          <img 
            src={item.image} 
            alt={item.name} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-80" 
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-800">
            <ImageIcon size={48} strokeWidth={1} />
          </div>
        )}
        
        {/* Top Badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-10">
          <Badge variant={getCategoryVariant(item.category)} className="bg-black/60 backdrop-blur-md border-white/10">
            {item.category}
          </Badge>
          <Badge className="bg-black/60 backdrop-blur-md border-white/10 flex items-center gap-1">
            {getStationIcon(item.station)}
            <span className="capitalize">{item.station}</span>
          </Badge>
        </div>

        {/* Price Tag Overlay */}
        {showPrice && (
          <div className="absolute bottom-3 right-3 bg-gold-500 text-slate-950 px-3 py-1 rounded-lg font-mono font-bold text-sm shadow-xl z-10">
            Rs. {item.price.toLocaleString()}
          </div>
        )}

        {/* Per Head Indicator */}
        {item.pricingStrategy === 'fixed_per_head' && (
          <div className="absolute bottom-3 left-3 bg-blue-600 text-white px-2 py-1 rounded-md flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider shadow-lg z-10 border border-blue-400/30">
            <Users size={12} /> Per Head
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className={`${compact ? 'p-3' : 'p-5'} space-y-2 flex-1 flex flex-col bg-slate-900/50 group-hover:bg-slate-900 transition-colors`}>
        <div>
          <h3 className="text-white font-bold leading-tight group-hover:text-gold-400 transition-colors truncate">
            {item.name}
          </h3>
          {item.nameUrdu && (
            <p className="text-slate-500 font-serif text-sm mt-0.5 leading-tight truncate">
              {item.nameUrdu}
            </p>
          )}
        </div>

        {/* Availability Toggle / Management Controls */}
        {editable && (
          <div className="mt-auto pt-4 border-t border-slate-800 flex justify-between items-center gap-3">
            <button 
              onClick={(e) => { e.stopPropagation(); onToggleAvailability?.(); }}
              className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                item.available ? 'text-green-500 hover:text-green-400' : 'text-red-500 hover:text-red-400'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${item.available ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
              {item.available ? 'In Stock' : 'Out of Stock'}
            </button>
            
            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0" 
                onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
              >
                <Edit2 size={12} />
              </Button>
              <Button 
                variant="danger" 
                size="sm" 
                className="h-8 w-8 p-0 bg-red-900/20 text-red-500 border border-red-900/30 hover:bg-red-600 hover:text-white"
                onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};