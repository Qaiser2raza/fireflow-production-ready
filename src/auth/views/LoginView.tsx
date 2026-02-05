import React, { useState, useEffect } from 'react';
import { Shield, Delete, ArrowRight, Lock, User, Smartphone } from 'lucide-react';

interface LoginViewProps {
  onLogin: (pin: string) => void;
  onStartRegistration?: () => void;
  onStartPairing?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, onStartPairing }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

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
      await onLogin(pin);
    } catch (err) {
      console.error("Login component error:", err);
      setError(true);
      setPin('');
      setIsProcessing(false);
    }

    setTimeout(() => {
      setIsProcessing(false);
      if (error) {
        setPin('');
      }
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 lg:p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent opacity-30"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-900/10 rounded-full blur-[128px]"></div>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center relative z-10">
        <div className="hidden lg:flex flex-col justify-center">
          <div className="mb-8 inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-gold-500">
            <Shield size={40} />
          </div>
          <h1 className="text-5xl font-serif font-bold text-white mb-6 leading-tight">
            Precision <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600">Secure Access</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-md leading-relaxed mb-8">
            Identify yourself to access the Fireflow Neural Network. All access is logged.
          </p>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-500">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800">
              <Lock size={14} /> 256-Bit Encrypted
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800">
              <User size={14} /> Biometric Ready
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-6 md:p-8 rounded-3xl shadow-2xl w-full max-w-md mx-auto">
          <div className="text-center mb-6 lg:mb-8">
            <div className="lg:hidden mb-4 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 text-gold-500">
              <Shield size={24} />
            </div>

            {/* User Avatar */}
            <div className="mb-4 flex justify-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-slate-800 bg-gradient-to-br from-gold-500 to-gold-600 flex items-center justify-center text-white shadow-xl">
                  <User size={32} />
                </div>
                <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 rounded-full border-4 border-slate-900 shadow-lg"></div>
              </div>
            </div>

            <h2 className="text-white text-xl font-bold tracking-wide">Terminal Access</h2>
            <p className="text-slate-500 text-xs uppercase tracking-widest mt-2">Enter 4-6 Digit Security PIN</p>
          </div>

          <div className="mb-6 lg:mb-8 flex justify-center gap-3 h-12 lg:h-16 items-center">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 lg:w-4 lg:h-4 rounded-full transition-all duration-300 ${i < pin.length
                  ? 'bg-gold-500 shadow-[0_0_15px_rgba(234,179,8,0.5)] scale-110'
                  : 'bg-slate-800'
                  } ${error ? 'bg-red-500 animate-shake' : ''}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 md:gap-4 max-w-xs mx-auto mb-6 lg:mb-8">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => handleNumberClick(num.toString())}
                className="aspect-square w-full rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xl md:text-2xl font-mono font-bold transition-all active:scale-95 flex items-center justify-center shadow-lg border-b-4 border-slate-950 active:border-b-0 active:translate-y-1"
              >
                {num}
              </button>
            ))}
            <div className="flex items-center justify-center">
              <Shield size={20} className="text-slate-600 opacity-50" />
            </div>
            <button
              onClick={() => handleNumberClick('0')}
              className="aspect-square w-full rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xl md:text-2xl font-mono font-bold transition-all active:scale-95 flex items-center justify-center shadow-lg border-b-4 border-slate-950 active:border-b-0 active:translate-y-1"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              className="aspect-square w-full rounded-2xl bg-slate-800/50 hover:bg-red-900/30 text-slate-400 hover:text-red-400 transition-all active:scale-95 flex items-center justify-center"
            >
              <Delete size={24} />
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={pin.length < 4 || isProcessing}
            className={`w-full py-3 md:py-4 rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${pin.length >= 4
              ? 'bg-gold-500 text-slate-950 hover:bg-gold-400 shadow-lg'
              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
          >
            {isProcessing ? 'Verifying...' : <span className="flex items-center gap-2">Authenticate <ArrowRight size={18} /></span>}
          </button>

          {onStartPairing && (
            <button
              onClick={onStartPairing}
              className="w-full py-3 md:py-4 mt-3 rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-cyan-400"
            >
              <Smartphone size={18} />
              Pair Device
            </button>
          )}

        </div>
      </div>
    </div>
  );
};
