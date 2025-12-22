import React from 'react';
import { 
  Grid, 
  UtensilsCrossed, 
  ChefHat, 
  GlassWater, 
  CakeSlice,
  ChevronRight
} from 'lucide-react';
import { Button } from '../ui/Button';

interface CategoryFilterProps {
  categories: string[];
  activeCategory: string;
  onSelectCategory: (category: string) => void;
  counts?: Record<string, number>;
  className?: string;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  categories,
  activeCategory,
  onSelectCategory,
  counts,
  className = ''
}) => {
  const getIcon = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'all': return <Grid size={14} />;
      case 'starters': return <UtensilsCrossed size={14} />;
      case 'mains': return <ChefHat size={14} />;
      case 'beverages': return <GlassWater size={14} />;
      case 'desserts': return <CakeSlice size={14} />;
      default: return <Grid size={14} />;
    }
  };

  const allCategories = ['all', ...categories];

  return (
    <div className={`flex items-center gap-3 overflow-x-auto no-scrollbar pb-2 ${className}`}>
      {allCategories.map((cat) => {
        const isActive = activeCategory === cat;
        const count = counts?.[cat];

        return (
          <Button
            key={cat}
            variant={isActive ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onSelectCategory(cat)}
            className={`shrink-0 border transition-all ${
              isActive 
                ? 'border-gold-500 shadow-lg shadow-gold-500/10' 
                : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              {getIcon(cat)}
              <span className="whitespace-nowrap">{cat === 'all' ? 'Everything' : cat}</span>
              {count !== undefined && (
                <span className={`text-[10px] px-1.5 rounded-full ${isActive ? 'bg-black/20 text-black' : 'bg-slate-800 text-slate-500'}`}>
                  {count}
                </span>
              )}
            </span>
          </Button>
        );
      })}
    </div>
  );
};