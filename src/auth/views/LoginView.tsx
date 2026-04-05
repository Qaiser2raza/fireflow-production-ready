import React, { useState, useEffect } from 'react';
import { Shield, Delete, ArrowRight, Lock, User, Smartphone, X, RefreshCcw, Wifi } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';


interface LoginViewProps {
  onLogin: (pin: string) => Promise<boolean | void> | void;
  onStartRegistration?: () => void;
  restaurantName?: string;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, onStartRegistration, restaurantName }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectivity, setConnectivity] = useState<any>(null);
  const [loadingConnectivity, setLoadingConnectivity] = useState(false);

  const fetchConnectivity = async () => {
    setLoadingConnectivity(true);
    try {
      const resp = await fetch('/api/connectivity');
      const data = await resp.json();
      if (data.success) {
        setConnectivity(data);
      }
    } catch (err) {
      console.error("Failed to fetch connectivity info:", err);
    } finally {
      setLoadingConnectivity(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isProcessing) return;

      if (/^[0-9]$/.test(e.key)) {
        if (pin.length < 6) {
          setPin(prev => prev + e.key);
          setError(false);
        }
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
        setError(false);
      } else if (e.key === 'Enter') {
        handleSubmit();
      } else if (e.key === 'Escape') {
        setPin('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, isProcessing]);

  useEffect(() => {
    if (pin.length === 6) {
      handleSubmit();
    }
  }, [pin]);

  const handleNumberClick = (num: string) => {
    if (pin.length < 6 && !isProcessing) {
      setPin(prev => prev + num);
      setError(false);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  const handleSubmit = async () => {
    if (pin.length < 4 || isProcessing) return;

    setIsProcessing(true);
    setError(false);
    await new Promise(resolve => setTimeout(resolve, 300));
    try {
      const success = await onLogin(pin);
      if (success === false) {
          throw new Error("Login failed");
      }
    } catch (err) {
      console.error("Login component error:", err);
      setError(true);
      setPin('');
      setIsProcessing(false);
      return;
    }

    setTimeout(() => {
      setIsProcessing(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 lg:p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent opacity-30"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-900/10 rounded-full blur-[128px]"></div>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center relative z-10">
        <div className="hidden lg:flex flex-col justify-center">
          <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-gold-500">
            <Shield size={32} />
          </div>
          <h1 className="text-4xl lg:text-5xl font-serif font-bold text-white mb-4 leading-tight">
            {restaurantName || 'Fireflow'} <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600">Secure Access</span>
          </h1>
          <p className="text-slate-400 text-sm max-w-sm leading-relaxed mb-6">
            Identify yourself to access the {restaurantName || 'Fireflow'} Neural Network. All access is logged.
          </p>
          <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">
              <Lock size={12} /> 256-Bit Encrypted
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">
              <User size={12} /> Biometric Ready
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-6 md:p-6 rounded-3xl shadow-2xl w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="lg:hidden mb-3 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 text-gold-500">
              <Shield size={20} />
            </div>

            {/* User Avatar */}
            <div className="mb-3 flex justify-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full overflow-hidden border-[3px] border-slate-800 bg-gradient-to-br from-gold-500 to-gold-600 flex items-center justify-center text-white shadow-xl">
                  <User size={28} />
                </div>
                <div className="absolute bottom-0 right-0 w-5 h-5 bg-green-500 rounded-full border-4 border-slate-900 shadow-lg"></div>
              </div>
            </div>

            <h2 className="text-white text-lg font-bold tracking-wide">
              {restaurantName ? `Terminal: ${restaurantName}` : 'Terminal Access'}
            </h2>
            <p className="text-slate-500 text-[9px] uppercase font-black tracking-widest mt-1">Enter 4-6 Digit Security PIN</p>
          </div>

          <div className="mb-6 flex justify-center gap-2.5 h-10 items-center">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full transition-all duration-300 ${i < pin.length
                  ? 'bg-gold-500 shadow-[0_0_15px_rgba(234,179,8,0.5)] scale-110'
                  : 'bg-slate-800'
                  } ${error ? 'bg-red-500 animate-shake' : ''}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 md:gap-3 max-w-[260px] mx-auto mb-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => handleNumberClick(num.toString())}
                className="aspect-square w-full rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xl font-mono font-bold transition-all active:scale-95 flex items-center justify-center shadow-lg border-b-[3px] border-slate-950 active:border-b-0 active:translate-y-1"
              >
                {num}
              </button>
            ))}
            <div className="flex items-center justify-center">
              <Shield size={16} className="text-slate-600 opacity-50" />
            </div>
            <button
              onClick={() => handleNumberClick('0')}
              className="aspect-square w-full rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xl font-mono font-bold transition-all active:scale-95 flex items-center justify-center shadow-lg border-b-[3px] border-slate-950 active:border-b-0 active:translate-y-1"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              className="aspect-square w-full rounded-2xl bg-slate-800/50 hover:bg-red-900/30 text-slate-400 hover:text-red-400 transition-all active:scale-95 flex items-center justify-center"
            >
              <Delete size={20} />
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={pin.length < 4 || isProcessing}
            className={`w-full py-3 rounded-xl font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all ${pin.length >= 4
              ? 'bg-gold-500 text-slate-950 hover:bg-gold-400 shadow-lg'
              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
          >
            {isProcessing ? 'Verifying...' : <span className="flex items-center gap-2">Authenticate <ArrowRight size={16} /></span>}
          </button>

          {onStartRegistration && (
            <button
              onClick={onStartRegistration}
              className="w-full py-2 mt-2 rounded-xl font-bold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-gold-400"
            >
              <Smartphone size={14} />
              Register New Restaurant
            </button>
          )}


          <button
            onClick={() => { setShowConnectModal(true); fetchConnectivity(); }}
            className="w-full py-2 mt-2 rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all text-slate-500 hover:text-gold-400 text-[10px] border border-dashed border-slate-800 hover:border-gold-500/50"
          >
            <Wifi size={14} />
            Connect Mobile
          </button>

        </div>
      </div>

      {/* Connectivity Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gold-500/0 via-gold-500 to-gold-500/0"></div>
            
            <button 
              onClick={() => setShowConnectModal(false)}
              className="absolute top-6 right-6 p-2 hover:bg-slate-800 rounded-full text-slate-500 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-8">
              <div className="inline-flex p-3 bg-gold-500/10 rounded-2xl text-gold-500 mb-4">
                <Smartphone size={24} />
              </div>
              <h3 className="text-2xl font-serif font-bold text-white">Connect Mobile</h3>
              <p className="text-slate-400 text-sm mt-2">Scan to open POS on your phone</p>
            </div>

            <div className="bg-white p-6 rounded-3xl mb-8 flex items-center justify-center shadow-[0_0_50px_rgba(234,179,8,0.1)] mx-auto w-fit">
              {loadingConnectivity ? (
                <div className="w-48 h-48 flex items-center justify-center">
                  <RefreshCcw size={32} className="text-slate-200 animate-spin" />
                </div>
              ) : connectivity ? (
                <QRCodeSVG 
                  value={connectivity.ips?.[0] || connectivity.localUrl} 
                  size={192}
                  level="H"
                  includeMargin={false}
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-red-500 text-xs font-bold text-center px-4">
                  Failed to load Network Info
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Direct Link (Type in browser)</p>
                <code className="text-gold-400 font-mono text-xs break-all">
                  {connectivity?.ips?.[0] || connectivity?.localUrl || 'Loading...'}
                </code>
              </div>

              <div className="text-center">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">Alternative Addresses</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-800/50 px-2 py-1 rounded-lg">
                    {connectivity?.localUrl?.replace('http://', '')}
                  </span>
                  {connectivity?.ips?.slice(1).map((ip: string) => (
                    <span key={ip} className="text-[10px] font-mono text-slate-500 bg-slate-800/50 px-2 py-1 rounded-lg">
                      {ip.replace('http://', '')}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-center text-[10px] text-slate-500 mt-8 leading-relaxed">
              Ensure your phone is on the <b>SAME WI-FI</b><br />
              as this computer.
            </p>
          </div>
        </div>
      )}

      {/* Subtle Cravex Branding at the bottom - hidden on small mobiles if too tight */}
      <div className="absolute bottom-4 left-0 w-full flex flex-col items-center pointer-events-none opacity-40 px-4 text-center">
        <div className="flex flex-col items-center gap-1">
          <div className="flex flex-col md:flex-row items-center gap-1 md:gap-2 grayscale brightness-200">
            <span className="text-[8px] md:text-[10px] font-black tracking-[0.2em] text-slate-500 uppercase">Powered By</span>
            <span className="text-xs md:text-sm font-black tracking-widest text-gold-500">{restaurantName?.toUpperCase() || 'FIREFLOW POS'}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[8px] md:text-[9px] text-slate-500 font-bold tracking-wider">© 2026 Cravex Solutions. All rights reserved.</span>
            <span className="text-[7px] md:text-[8px] text-slate-600 font-mono mt-0.5">SECURE TERMINAL V2.5.0-CRAVEX</span>
          </div>
        </div>
      </div>
    </div>
  );
};
