import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ChefHat, Receipt } from 'lucide-react';

export const ConfirmationPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const restaurantId = searchParams.get('restaurant_id');
  const tableId = searchParams.get('table');

  const backToMenu = () => {
    navigate(`/?restaurant_id=${restaurantId}&table=${tableId}`);
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#050810', color: '#f1f5f9', fontFamily: 'Outfit, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      
      <div style={{ width: 80, height: 80, borderRadius: 40, background: 'linear-gradient(135deg, rgba(212,160,23,0.2) 0%, rgba(212,160,23,0.05) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32, position: 'relative' }}>
        <CheckCircle2 size={40} color="#d4a017" style={{ zIndex: 2 }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 80, height: 80, borderRadius: '50%', border: '1px solid rgba(212,160,23,0.3)', animation: 'pulse 2s infinite' }}></div>
      </div>

      <h1 style={{ margin: '0 0 16px', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #fff 0%, #a0aec0 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Order Received!
      </h1>
      
      <p style={{ margin: '0 0 40px', fontSize: 16, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, maxWidth: 300 }}>
        Our kitchen staff is preparing your delicious meal right now.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 320 }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ background: 'rgba(212,160,23,0.1)', padding: 10, borderRadius: 10, color: '#d4a017' }}>
            <ChefHat size={20} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#fff' }}>Sent to Kitchen</p>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Your order is being prepared.</p>
          </div>
        </div>
        
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: 10, borderRadius: 10, color: 'rgba(255,255,255,0.6)' }}>
            <Receipt size={20} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#fff' }}>Pay at Counter</p>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Please pay when you are ready to leave.</p>
          </div>
        </div>
      </div>

      <button
        onClick={backToMenu}
        style={{
          marginTop: 48, width: '100%', maxWidth: 320, padding: '16px 24px', borderRadius: 16, border: 'none',
          background: 'rgba(255,255,255,0.05)', color: '#fff', fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 15, cursor: 'pointer', transition: 'all 0.2s',
          borderTop: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        Order More Items
      </button>

      <style>{`
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
};
