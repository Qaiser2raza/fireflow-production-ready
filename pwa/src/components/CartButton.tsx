import React from 'react';
import { ShoppingBag } from 'lucide-react';

interface Props {
  count: number;
  total: number;
  onClick: () => void;
}

export const CartButton: React.FC<Props> = ({ count, total, onClick }) => {
  if (count === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        width: 'calc(100% - 32px)',
        maxWidth: 420,
      }}
    >
      <button
        onClick={onClick}
        style={{
          width: '100%',
          padding: '16px 24px',
          borderRadius: 16,
          border: 'none',
          background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 100%)',
          color: '#000',
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 800,
          fontSize: 16,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 8px 32px rgba(212,160,23,0.5)',
          transition: 'all 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 8,
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 13,
          }}>
            {count}
          </div>
          <ShoppingBag size={18} />
          <span>View Cart</span>
        </div>
        <span>Rs {total.toFixed(0)}</span>
      </button>
    </div>
  );
};
