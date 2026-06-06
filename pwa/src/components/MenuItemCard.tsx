import React from 'react';
import { MenuItem } from '../hooks/useMenu';
import { Plus, Minus, ImageOff } from 'lucide-react';

interface Props {
  item: MenuItem;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}

export const MenuItemCard: React.FC<Props> = ({ item, quantity, onAdd, onRemove }) => {
  return (
    <div
      style={{
        background: quantity > 0
          ? 'linear-gradient(135deg, rgba(212,160,23,0.08) 0%, rgba(10,14,26,0.95) 100%)'
          : 'rgba(255,255,255,0.03)',
        border: quantity > 0 ? '1px solid rgba(212,160,23,0.4)' : '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Image */}
      <div style={{ width: '100%', aspectRatio: '16/9', background: 'rgba(255,255,255,0.04)', position: 'relative', overflow: 'hidden' }}>
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.15)' }}>
            <ImageOff size={28} />
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '14px 14px 10px', flex: 1 }}>
        <p style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: '#f1f5f9', lineHeight: 1.3 }}>{item.name}</p>
        {item.description && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.description}
          </p>
        )}
      </div>

      {/* Price + Controls */}
      <div style={{ padding: '8px 14px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 17, color: '#d4a017' }}>
          Rs {item.price.toFixed(0)}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {quantity > 0 && (
            <button
              onClick={onRemove}
              style={{
                width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(212,160,23,0.4)',
                background: 'rgba(212,160,23,0.1)', color: '#d4a017', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
              }}
            >
              <Minus size={14} />
            </button>
          )}
          {quantity > 0 && (
            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16, color: '#fff', minWidth: 20, textAlign: 'center' }}>
              {quantity}
            </span>
          )}
          <button
            onClick={onAdd}
            style={{
              width: 32, height: 32, borderRadius: '50%', border: 'none',
              background: 'linear-gradient(135deg, #d4a017, #b8860b)', color: '#000',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(212,160,23,0.35)', transition: 'all 0.15s',
            }}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
