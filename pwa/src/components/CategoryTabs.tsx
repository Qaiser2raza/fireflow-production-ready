import React from 'react';
import { MenuCategory } from '../hooks/useMenu';

interface Props {
  categories: MenuCategory[];
  activeId: string;
  onChange: (id: string) => void;
}

export const CategoryTabs: React.FC<Props> = ({ categories, activeId, onChange }) => {
  return (
    <div style={{
      display: 'flex',
      overflowX: 'auto',
      gap: 8,
      padding: '0 16px 12px',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    }}>
      {[{ id: 'ALL', name: 'All' }, ...categories].map((cat) => {
        const isActive = cat.id === activeId;
        return (
          <button
            key={cat.id}
            onClick={() => onChange(cat.id)}
            style={{
              flexShrink: 0,
              padding: '8px 18px',
              borderRadius: 40,
              border: isActive ? 'none' : '1px solid rgba(255,255,255,0.1)',
              background: isActive
                ? 'linear-gradient(135deg, #d4a017, #b8860b)'
                : 'rgba(255,255,255,0.04)',
              color: isActive ? '#000' : 'rgba(255,255,255,0.55)',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: isActive ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: isActive ? '0 4px 16px rgba(212,160,23,0.35)' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {cat.name}
          </button>
        );
      })}
    </div>
  );
};
