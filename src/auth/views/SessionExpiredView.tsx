import React from 'react';
import { Clock, LogIn, ShieldAlert } from 'lucide-react';

interface SessionExpiredViewProps {
  onBackToLogin: () => void;
}

export const SessionExpiredView: React.FC<SessionExpiredViewProps> = ({ onBackToLogin }) => {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center">
        {/* Icon */}
        <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Clock className="w-10 h-10 text-amber-500" />
        </div>

        {/* English Message */}
        <h1 className="text-2xl font-bold text-white mb-2">Session Ended</h1>
        <p className="text-slate-400 mb-6">
          Your assigned session duration has expired. For security, you have been logged out of this device.
        </p>

        {/* Divider */}
        <div className="h-px bg-slate-800 w-full my-6" />

        {/* Urdu Message */}
        <h1 className="text-2xl font-bold text-white mb-2 urdu" dir="rtl">سیشن ختم ہو گیا</h1>
        <p className="text-slate-400 mb-8 urdu" dir="rtl">
          آپ کے سیشن کا وقت ختم ہو چکا ہے۔ سیکورٹی کے لیے، آپ کو اس ڈیوائس سے لاگ آؤٹ کر دیا گیا ہے۔
        </p>

        {/* Action Button */}
        <button
          onClick={onBackToLogin}
          className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-cyan-500/20"
        >
          <LogIn className="w-5 h-5" />
          <span>Back to Login / لاگ ان پر واپس جائیں</span>
        </button>

        <div className="mt-8 flex items-center justify-center gap-2 text-slate-500 text-xs">
          <ShieldAlert className="w-4 h-4" />
          <span>Secure Session Management by Fireflow</span>
        </div>
      </div>
    </div>
  );
};
