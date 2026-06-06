import { useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { MenuDisplay } from './components/MenuDisplay';
import { CartDrawer } from './components/CartDrawer';
import { OrderTracking } from './components/OrderTracking';
import { getCart, addToCart, updateQuantity, clearCart } from './lib/db';

export default function App() {
  const [tableId, setTableId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(localStorage.getItem('currentOrderId'));
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const table = params.get('table');
    const slugParam = params.get('slug'); // For dev/fallback
    const pathParts = window.location.pathname.split('/');
    // e.g. /menu/pizza-palace/order => pathParts = ['', 'menu', 'pizza-palace', 'order']
    // e.g. /pwa/pizza-palace/order => pathParts = ['', 'pwa', 'pizza-palace', 'order']
    const extractedSlug = slugParam || (pathParts.length >= 3 ? pathParts[pathParts.length - 2] : null);

    if (extractedSlug) setSlug(extractedSlug);
    if (table) {
      setTableId(table);
      getCart(table).then(setCartItems);
    }
  }, []);

  const handleAddToCart = async (item: any, quantity: number) => {
    if (!tableId) return;
    const newCart = await addToCart(tableId, item, quantity);
    setCartItems(newCart);
  };

  const handleUpdateQuantity = async (itemId: string, quantity: number) => {
    if (!tableId) return;
    const newCart = await updateQuantity(tableId, itemId, quantity);
    setCartItems(newCart);
  };

  const handleClearCart = async () => {
    if (!tableId) return;
    await clearCart(tableId);
    setCartItems([]);
  };

  const handleOrderPlaced = (newOrderId: string) => {
    localStorage.setItem('currentOrderId', newOrderId);
    setOrderId(newOrderId);
    handleClearCart();
    setIsCartOpen(false);
  };

  const handleNewOrder = () => {
    localStorage.removeItem('currentOrderId');
    setOrderId(null);
  };

  if (!tableId || !slug) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-4 text-center">
        <div className="rounded-2xl bg-card p-8 shadow-sm border border-border">
          <h1 className="text-2xl font-bold text-foreground mb-2">Invalid QR Code</h1>
          <p className="text-muted-foreground">Please scan the QR code on your table to access the menu.</p>
        </div>
      </div>
    );
  }

  if (orderId) {
    return <OrderTracking orderId={orderId} onNewOrder={handleNewOrder} />;
  }

  const cartTotal = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-md shadow-sm border-b border-border px-4 py-4 mb-4">
        <h1 className="text-xl font-bold text-foreground">QR Menu</h1>
        <p className="text-sm text-primary">Table {tableId}</p>
      </header>

      <main className="max-w-3xl mx-auto">
        <MenuDisplay slug={slug} onAddToCart={handleAddToCart} />
      </main>

      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)] z-40 md:hidden">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-primary text-primary-foreground py-3 px-4 rounded-xl font-black uppercase tracking-wider flex items-center justify-between shadow-lg shadow-primary/20"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              <span>{cartCount} items</span>
            </div>
            <span>Rs. {cartTotal.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* Floating Cart for Desktop */}
      {cartCount > 0 && (
        <button
          onClick={() => setIsCartOpen(true)}
          className="hidden md:flex fixed bottom-8 right-8 bg-primary text-primary-foreground py-3 px-6 rounded-full font-black uppercase tracking-wider shadow-lg shadow-primary/20 hover:shadow-xl hover:scale-105 transition-all items-center gap-3 z-40"
        >
          <ShoppingCart className="w-5 h-5" />
          <span>{cartCount} items</span>
          <span className="bg-white/20 px-2 py-1 rounded-md text-sm">Rs. {cartTotal.toFixed(2)}</span>
        </button>
      )}

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        tableId={tableId}
        slug={slug}
        onUpdateQuantity={handleUpdateQuantity}
        onOrderPlaced={handleOrderPlaced}
        total={cartTotal}
      />
    </div>
  );
}
