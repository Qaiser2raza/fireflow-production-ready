import React, { useState } from 'react';
import { Shield, Key, Server, User, Lock, Loader2 } from 'lucide-react';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';
import { Button } from '../../shared/ui/Button';

interface ActivationProps {
  onSuccess: () => void;
}

export const ActivationView: React.FC<ActivationProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    licenseKey: '',
    restaurantName: '',
    phone: '',
    ownerName: '',
    ownerPin: '',
    currency: 'PKR',
    timezone: 'Asia/Karachi'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('http://localhost:3001/api/system/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Activation failed');

      // Success!
      setTimeout(() => {
        onSuccess(); // Trigger App reload
      }, 1000);

    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent opacity-50"></div>
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-gold-500/10 rounded-full blur-[100px]"></div>

      <Card className="w-full max-w-2xl bg-slate-900/80 backdrop-blur-xl border-slate-800 shadow-2xl relative z-10 animate-in fade-in zoom-in duration-500">
        <div className="p-8">

          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gold-500/10 text-gold-500 mb-4 border border-gold-500/20 shadow-[0_0_30px_rgba(234,179,8,0.1)]">
              <Shield size={32} />
            </div>
            <h1 className="text-3xl font-serif font-bold text-white mb-2">System Activation</h1>
            <p className="text-slate-400 text-sm">Initialize your Enterprise Environment</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-950/30 border border-red-500/30 rounded-xl text-red-400 text-sm text-center font-bold animate-pulse">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Step 1: License */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-gold-500 text-xs font-black uppercase tracking-widest mb-2">
                <Key size={12} /> License Verification
              </div>
              <Input
                placeholder="Enter SaaS License Key (e.g. SAAS-XXXX-XXXX)"
                className="text-center font-mono text-lg tracking-widest border-gold-500/30 focus:border-gold-500 h-14"
                value={formData.licenseKey}
                onChange={e => setFormData({ ...formData, licenseKey: e.target.value.toUpperCase() })}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              {/* Step 2: Identity */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-black uppercase tracking-widest mb-2">
                  <Server size={12} /> Establishment
                </div>
                <Input
                  placeholder="Restaurant Name"
                  value={formData.restaurantName}
                  onChange={e => setFormData({ ...formData, restaurantName: e.target.value })}
                  required
                />
                <Input
                  placeholder="Official Phone Number"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </div>

              {/* Step 3: Admin */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-black uppercase tracking-widest mb-2">
                  <User size={12} /> Super Admin
                </div>
                <Input
                  placeholder="Owner Full Name"
                  value={formData.ownerName}
                  onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                  required
                />
                <Input
                  type="password"
                  maxLength={6}
                  placeholder="Create 6-Digit Master PIN"
                  className="font-mono tracking-[0.5em]"
                  value={formData.ownerPin}
                  onChange={e => setFormData({ ...formData, ownerPin: e.target.value.replace(/\D/g, '') })}
                  required
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="pt-8 border-t border-slate-800 flex flex-col items-center gap-4">
              <Button
                type="submit"
                size="lg"
                variant="primary"
                className="w-full h-14 text-lg shadow-[0_0_20px_rgba(234,179,8,0.2)] hover:shadow-[0_0_30px_rgba(234,179,8,0.4)] transition-all"
                loading={loading}
                disabled={!formData.licenseKey || !formData.restaurantName || !formData.ownerPin}
              >
                {loading ? 'Initializing Core...' : 'Activate System'}
              </Button>

              <div className="flex items-center gap-2 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                <Lock size={10} /> 256-Bit Encrypted Initialization
              </div>
            </div>

          </form>
        </div>
      </Card>
    </div>
  );
};