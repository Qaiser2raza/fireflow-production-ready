import { useEffect, useState } from 'react';
import { fetchMenu, fetchCategories, type MenuItem } from '../lib/api';
import { Plus } from 'lucide-react';
import { cn } from '../lib/utils';

export function MenuDisplay({ slug, onAddToCart }: { slug: string, onAddToCart: (item: MenuItem, qty: number) => void }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchMenu(slug), fetchCategories(slug)])
      .then(([menuData, catData]) => {
        const availableItems = menuData.filter(i => i.available);
        setItems(availableItems);
        setCategories(catData);
        if (catData.length > 0) setActiveCategory(catData[0]);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading menu...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  const displayItems = items.filter(i => i.menu_categories?.name === activeCategory);

  return (
    <div className="w-full">
      <div className="overflow-x-auto whitespace-nowrap px-4 pb-2 mb-6 scrollbar-hide">
        <div className="flex space-x-3">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                activeCategory === cat 
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105" 
                  : "bg-card text-muted-foreground border border-border hover:text-foreground hover:border-slate-700"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 space-y-4">
        {displayItems.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-sm font-medium">No items available in this category.</p>
        ) : (
          displayItems.map(item => (
            <div key={item.id} className="bg-card rounded-2xl p-5 flex justify-between gap-4 shadow-lg border border-border transition-all hover:border-slate-700">
              <div className="flex-1">
                <h3 className="font-bold text-foreground">{item.name}</h3>
                {item.description && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">{item.description}</p>}
                <p className="text-primary font-black text-sm mt-3">Rs. {item.price}</p>
              </div>
              <div className="flex flex-col items-end justify-center pl-2">
                <button
                  onClick={() => onAddToCart(item, 1)}
                  className="w-12 h-12 rounded-2xl bg-slate-800/50 text-primary border border-slate-700/50 flex items-center justify-center hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
