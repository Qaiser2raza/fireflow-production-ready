import React, { useState, useEffect } from 'react';
import { Banknote, LogIn, LogOut, TrendingUp, AlertTriangle, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

interface Props {
  currentUser: any;
  onSessionStarted: (session: any) => void;
  onSessionEnded: () => void;
}

export const ShiftManagementOverlay: React.FC<Props> = ({ currentUser, onSessionStarted, onSessionEnded }) => {
  const [mode, setMode] = useState<'OPEN' | 'CLOSE' | 'SUMMARY'>('OPEN');
  const [openingFloat, setOpeningFloat] = useState<string>('0');
  const [actualCash, setActualCash] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);

  const API = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

  useEffect(() => {
    checkActiveSession();
  }, []);

  const checkActiveSession = async () => {
    try {
      const res = await fetchWithAuth(`${API}/cashier/current?restaurantId=${currentUser.restaurant_id}&staffId=${currentUser.id}`);
      const data = await res.json();
      if (data.success && data.session) {
        setActiveSession(data.session);
        setMode('CLOSE');
        fetchSummary(data.session.id);
      } else {
        setMode('OPEN');
      }
    } catch (e) {
      console.error('Session check failed', e);
    }
  };

  const fetchSummary = async (sessionId: string) => {
    try {
      const res = await fetchWithAuth(`${API}/cashier/${sessionId}/summary`);
      const data = await res.json();
      if (data.success) {
        setSessionSummary(data.summary);
      }
    } catch (e) {
      console.error('Fetch summary failed', e);
    }
  };

  const handleOpen = async () => {
    setIsProcessing(true);
    try {
      const res = await fetchWithAuth(`${API}/cashier/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: currentUser.restaurant_id,
          staffId: currentUser.id,
          openingFloat: Number(openingFloat)
        })
      });
      const data = await res.json();
      if (data.success) {
        onSessionStarted(data.session);
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error('Open failed', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = async () => {
    if (!actualCash) return alert('Please enter actual cash in drawer');
    setIsProcessing(true);
    try {
      const res = await fetchWithAuth(`${API}/cashier/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSession.id,
          actualCash: Number(actualCash),
          closedBy: currentUser.id,
          notes: notes
        })
      });
      const data = await res.json();
      if (data.success) {
        setMode('SUMMARY');
        setSessionSummary(data.session); // Backend returns the full updated session
      }
    } catch (e) {
      console.error('Close failed', e);
    } finally {
      setIsProcessing(false);
    }
  };

  if (mode === 'OPEN') {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 max-w-md w-full shadow-2xl">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mb-4 border border-indigo-500/30">
              <Banknote size={40} className="text-indigo-400" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">Open Drawer</h2>
            <p className="text-slate-400">Please enter the starting cash float to begin your shift.</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider">Starting Float (PKR)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">Rs.</span>
                <input
                  type="number"
                  className="w-full bg-slate-900 border border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-2xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={openingFloat}
                  onChange={e => setOpeningFloat(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <button
              onClick={handleOpen}
              disabled={isProcessing}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl py-4 font-bold text-lg shadow-lg shadow-indigo-900/20 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="animate-spin" /> : <LogIn size={20} />}
              START SHIFT
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'CLOSE') {
    const expected = Number(sessionSummary?.calculatedSummary?.openingFloat || 0) + Number(sessionSummary?.calculatedSummary?.cashSales || 0);
    const diff = (Number(actualCash) || 0) - expected;

    return (
      <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 max-w-lg w-full shadow-2xl my-8">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4 border border-red-500/30">
              <LogOut size={32} className="text-red-400" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-1">End of Shift</h2>
            <p className="text-slate-400">Count your cash and reconcile the drawer.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50">
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">Expectation</p>
              <p className="text-xl font-bold text-white">Rs. {expected.toLocaleString()}</p>
            </div>
            <div className={`p-4 rounded-2xl border ${diff >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">Variance</p>
              <p className={`text-xl font-bold ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {diff > 0 ? '+' : ''}{diff.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider">Actual Cash in Drawer</label>
              <input
                type="number"
                className="w-full bg-slate-900 border border-slate-700 rounded-2xl py-4 px-6 text-2xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 text-center"
                placeholder="0.00"
                value={actualCash}
                onChange={e => setActualCash(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider">Shift Notes</label>
              <textarea
                className="w-full bg-slate-900 border border-slate-700 rounded-2xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-slate-600 h-24"
                placeholder="Mention any discrepancies..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            <button
              onClick={handleClose}
              disabled={isProcessing}
              className="w-full bg-red-600 hover:bg-red-500 text-white rounded-2xl py-4 font-bold text-lg shadow-lg shadow-red-900/20 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="animate-spin" /> : <TrendingUp size={20} />}
              CLOSE DRAWER & END SHIFT
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'SUMMARY') {
     return (
        <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-4">
           <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6 mx-auto border border-emerald-500/30">
                 <AlertTriangle size={40} className="text-emerald-400" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Shift Reconciled</h2>
              <p className="text-slate-400 mb-8">Daily report synced to financial records.</p>
              
              <div className="bg-slate-900/50 rounded-2xl p-6 mb-8 text-left space-y-3">
                 <div className="flex justify-between text-sm"><span className="text-slate-500">Sales Total:</span><span className="text-white font-bold">Rs. {Number(sessionSummary?.expected_cash || 0).toLocaleString()}</span></div>
                 <div className="flex justify-between text-sm"><span className="text-slate-500">Cash Counted:</span><span className="text-white font-bold">Rs. {Number(sessionSummary?.actual_cash || 0).toLocaleString()}</span></div>
                 <div className="border-t border-slate-700 pt-3 flex justify-between">
                    <span className="text-slate-400 font-bold">Final Variance:</span>
                    <span className={`font-bold ${Number(sessionSummary?.difference || 0) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                       Rs. {Number(sessionSummary?.difference || 0).toLocaleString()}
                    </span>
                 </div>
              </div>

              <button
                 onClick={onSessionEnded}
                 className="w-full bg-slate-700 hover:bg-slate-600 text-white rounded-2xl py-4 font-bold text-lg transition-all"
              >
                 EXIT TO DASHBOARD
              </button>
           </div>
        </div>
     );
  }

  return null;
};
