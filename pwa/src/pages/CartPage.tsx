import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, Loader2, UtensilsCrossed, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

export const CartPage: React.FC<Props> = ({ cart, setCart }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const restaurantId = searchParams.get('restaurant_id');
  const tableId = searchParams.get('table');

  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cartItems = Object.values(cart);
  const total = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => {
      const item = prev[id];
      if (!item) return prev;
      
      const newQuantity = item.quantity + delta;
      const updated = { ...prev };
      
      if (newQuantity <= 0) {
        delete updated[id];
      } else {
        updated[id] = { ...item, quantity: newQuantity };
      }
      return updated;
    });
  };

  const submitOrder = async () => {
    if (!restaurantId) {
      setError('Invalid restaurant ID. Cannot place order.');
      return;
    }
    
    if (cartItems.length === 0) {
      setError('Your cart is empty.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const orderPayload = {
        restaurant_id: restaurantId,
        table_number: 0, // Backend will resolve via table_id if needed, or we just trust the bridge
        table_label: tableId ? `Table ID: ${tableId}` : 'Unknown Table',
        items: cartItems.map(item => ({
          menu_item_id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.price
        })),
        subtotal: total,
        notes: notes.trim() || null,
        customer_name: customerName.trim() || 'Guest',
        submitted_at: new Date().toISOString()
      };

      const { error: submitErr } = await supabase
        .from('qr_orders_queue')
        .insert(orderPayload);

      if (submitErr) throw submitErr;

      // Clear cart and redirect
      setCart({});
      navigate(`/confirmation?restaurant_id=${restaurantId}&table=${tableId}`);
      
    } catch (err: any) {
      console.error('Failed to submit order:', err);
      setError('Failed to submit your order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cartItems.length === 0) {
    return (
      <div style={{ minHeight: '100dvh', background: '#050810', color: '#f1f5f9', fontFamily: 'Outfit, sans-serif', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#fff', padding: 0, cursor: 'pointer' }}>
            <ArrowLeft size={24} />
          </button>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Your Order</h1>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)' }}>
            <UtensilsCrossed size={32} />
          </div>
          <div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, color: '#fff' }}>Your cart is empty</h2>
            <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Add some delicious items from the menu to get started.</p>
          </div>
          <button 
            onClick={() => navigate(-1)}
            style={{ marginTop: 16, padding: '12px 24px', borderRadius: 12, border: '1px solid rgba(212,160,23,0.3)', background: 'rgba(212,160,23,0.1)', color: '#d4a017', fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
          >
            Browse Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#050810', color: '#f1f5f9', fontFamily: 'Outfit, sans-serif', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{
        background: 'rgba(5,8,16,0.85)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '20px 16px', position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 16
      }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#fff', padding: 0, cursor: 'pointer' }}>
          <ArrowLeft size={24} />
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Your Order</h1>
      </div>

      <div style={{ padding: 16 }}>
        {/* Error Alert */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: 16, marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 14, color: '#fca5a5', lineHeight: 1.5 }}>{error}</p>
          </div>
        )}

        {/* Order Items */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '0 16px', marginBottom: 24 }}>
          {cartItems.map((item, index) => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 0', borderBottom: index < cartItems.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none'
            }}>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#fff' }}>{item.name}</p>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#d4a017' }}>Rs {item.price.toFixed(0)}</p>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
                <button
                  onClick={() => updateQuantity(item.id, -1)}
                  style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Minus size={14} />
                </button>
                <span style={{ fontSize: 15, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.id, 1)}
                  style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Name (Optional)</label>
            <input 
              type="text" 
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="How should we call you?"
              style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '14px 16px', color: '#fff', fontSize: 15, fontFamily: 'Outfit, sans-serif' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Special Instructions</label>
            <textarea 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any allergies or dietary requirements?"
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '14px 16px', color: '#fff', fontSize: 15, fontFamily: 'Outfit, sans-serif', resize: 'none' }}
            />
          </div>
        </div>

        {/* Totals */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 15, color: 'rgba(255,255,255,0.6)' }}>
            <span>Subtotal</span>
            <span>Rs {total.toFixed(0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 20, fontWeight: 700, color: '#fff' }}>
            <span>Total</span>
            <span style={{ color: '#d4a017' }}>Rs {total.toFixed(0)}</span>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 100, width: 'calc(100% - 32px)', maxWidth: 420
      }}>
        <button
          onClick={submitOrder}
          disabled={isSubmitting}
          style={{
            width: '100%', padding: '16px 24px', borderRadius: 16, border: 'none',
            background: isSubmitting ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
            color: isSubmitting ? 'rgba(255,255,255,0.5)' : '#000',
            fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 16, cursor: isSubmitting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            boxShadow: isSubmitting ? 'none' : '0 8px 32px rgba(212,160,23,0.5)', transition: 'all 0.2s'
          }}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              Sending Order...
            </>
          ) : (
            'Place Order'
          )}
        </button>
      </div>
      
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, textarea:focus { outline: none; border-color: rgba(212,160,23,0.5) !important; background: rgba(212,160,23,0.05) !important; }
      `}</style>
    </div>
  );
};
