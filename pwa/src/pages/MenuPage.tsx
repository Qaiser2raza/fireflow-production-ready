import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMenu } from '../hooks/useMenu';
import { CategoryTabs } from '../components/CategoryTabs';
import { MenuItemCard } from '../components/MenuItemCard';
import { CartButton } from '../components/CartButton';
import { AlertCircle, Loader2, UtensilsCrossed } from 'lucide-react';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface Props {
  cart: Record<string, CartItem>;
  setCart: React.Dispatch<React.SetStateAction<Record<string, CartItem>>>;
}

export const MenuPage: React.FC<Props> = ({ cart, setCart }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const restaurantId = searchParams.get('restaurant_id');
  const tableId = searchParams.get('table');
  const [activeCategory, setActiveCategory] = useState('ALL');

  const { categories, items, loading, error } = useMenu(restaurantId);

  const filteredItems = useMemo(() => {
    if (activeCategory === 'ALL') return items;
    return items.filter(i => i.category_id === activeCategory);
  }, [items, activeCategory]);

  const cartCount = Object.values(cart).reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = Object.values(cart).reduce((sum, i) => sum + i.price * i.quantity, 0);

  const addToCart = (item: { id: string; name: string; price: number }) => {
    setCart(prev => ({
      ...prev,
      [item.id]: {
        ...item,
        quantity: (prev[item.id]?.quantity || 0) + 1,
      },
    }));
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const updated = { ...prev };
      if (updated[itemId]?.quantity > 1) {
        updated[itemId] = { ...updated[itemId], quantity: updated[itemId].quantity - 1 };
      } else {
        delete updated[itemId];
      }
      return updated;
    });
  };

  const goToCart = () => {
    navigate(`/cart?restaurant_id=${restaurantId}&table=${tableId}`);
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#050810', color: '#f1f5f9', fontFamily: 'Outfit, sans-serif', paddingBottom: 100 }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(5,8,16,1) 0%, rgba(5,8,16,0.85) 100%)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '20px 16px 16px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #d4a017, #b8860b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <UtensilsCrossed size={18} color="#000" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>FireFlow Menu</h1>
            {tableId && (
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(212,160,23,0.8)', fontWeight: 600 }}>
                Scan &amp; Order — Table Ready
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      {!loading && !error && categories.length > 0 && (
        <div style={{ paddingTop: 16 }}>
          <CategoryTabs
            categories={categories}
            activeId={activeCategory}
            onChange={setActiveCategory}
          />
        </div>
      )}

      {/* Content */}
      <div style={{ padding: '8px 16px' }}>
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 80 }}>
            <Loader2 size={36} color="#d4a017" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: 0 }}>Loading menu…</p>
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 80, textAlign: 'center' }}>
            <AlertCircle size={48} color="#ef4444" />
            <p style={{ color: '#ef4444', fontSize: 15, margin: 0, fontWeight: 600 }}>{error}</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>Ask your waiter for assistance.</p>
          </div>
        )}

        {!loading && !error && filteredItems.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 80, color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
            No items in this category.
          </div>
        )}

        {!loading && !error && filteredItems.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
            paddingTop: 4,
          }}>
            {filteredItems.map(item => (
              <MenuItemCard
                key={item.id}
                item={item}
                quantity={cart[item.id]?.quantity || 0}
                onAdd={() => addToCart(item)}
                onRemove={() => removeFromCart(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      <CartButton count={cartCount} total={cartTotal} onClick={goToCart} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
