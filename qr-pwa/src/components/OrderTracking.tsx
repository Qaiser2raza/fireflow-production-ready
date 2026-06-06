import { useEffect, useState } from 'react';
import { pollOrderStatus } from '../lib/api';

export function OrderTracking({ orderId, onNewOrder }: { orderId: string, onNewOrder: () => void }) {
  const [statusMsg, setStatusMsg] = useState('Checking order status...');
  const [status, setStatus] = useState('PENDING_APPROVAL');

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const checkStatus = async () => {
      try {
        const data = await pollOrderStatus(orderId);
        setStatusMsg(data.message);
        setStatus(data.status);

        if (data.status === 'COMPLETED' || data.status === 'REJECTED' || data.status === 'CANCELLED') {
          clearInterval(interval);
        }
      } catch (err: any) {
        setStatusMsg(err.message || 'Error tracking order. Will retry...');
      }
    };

    checkStatus();
    interval = setInterval(checkStatus, 5000);

    return () => clearInterval(interval);
  }, [orderId]);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-2xl text-center border border-border">
        <div className="mb-6">
          <div className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full text-5xl shadow-inner ${
            status === 'COMPLETED' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
            (status === 'REJECTED' || status === 'CANCELLED') ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
            'bg-amber-500/20 text-amber-400 animate-pulse border border-amber-500/30'
          }`}>
            {status === 'COMPLETED' ? '✅' : 
             (status === 'REJECTED' || status === 'CANCELLED') ? '❌' : '⏳'}
          </div>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-widest text-foreground mb-2">Order Status</h2>
        <p className="text-muted-foreground mb-8 font-medium">{statusMsg}</p>
        
        <p className="text-xs text-slate-500 mb-8 font-bold tracking-wider">Order ID: {orderId.split('-')[0].toUpperCase()}</p>

        {(status === 'COMPLETED' || status === 'REJECTED' || status === 'CANCELLED') && (
          <button
            onClick={onNewOrder}
            className="w-full rounded-xl bg-primary px-4 py-4 font-black uppercase tracking-widest text-primary-foreground transition-all hover:scale-[0.98] shadow-lg shadow-primary/20"
          >
            Place New Order
          </button>
        )}
      </div>
    </div>
  );
}
