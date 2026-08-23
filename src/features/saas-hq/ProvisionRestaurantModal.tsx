import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Loader2, Printer, X } from 'lucide-react';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';
import { validateProvisionForm } from './provisionHelpers';

// ==========================================
// PHASE 1 SLICE C — VAULT PROVISIONING MODAL
// ==========================================
// Security contract:
//  - the plaintext PIN exists ONLY in this component's React memory between
//    the successful 201 response and modal close (cleared on Done/Close);
//  - it is never written to localStorage/sessionStorage/URLs/console;
//  - the handover step states plainly that the PIN cannot be retrieved later.

interface ProvisionResponse {
  restaurant: { id: string; name: string; slug: string | null };
  ownerStaff: {
    id: string;
    name: string;
    role: string;
    must_change_pin: boolean;
    pin_expires_at: string | null;
    temporary_pin: string;
  };
  owner_invite_id: string;
}

interface ProvisionRestaurantModalProps {
  open: boolean;
  onClose: () => void;
  onProvisioned: () => void;
}

const INPUT_CLASS = 'w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/50 transition-all placeholder:text-slate-600';
const LABEL_CLASS = 'block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5';

export const ProvisionRestaurantModal: React.FC<ProvisionRestaurantModalProps> = ({ open, onClose, onProvisioned }) => {
  const [phase, setPhase] = useState<'form' | 'submitting' | 'handover'>('form');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionResponse | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [plan, setPlan] = useState<'BASIC' | 'STANDARD' | 'PREMIUM' | 'ENTERPRISE'>('STANDARD');
  const [status, setStatus] = useState<'trial' | 'active'>('trial');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');

  if (!open) return null;

  const API_BASE = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

  const resetForm = () => {
    setName(''); setSlug(''); setCity(''); setPhone(''); setAddress('');
    setOwnerName(''); setOwnerEmail(''); setOwnerPhone('');
    setPlan('STANDARD'); setStatus('trial');
  };

  const dismissSecret = () => {
    // Drop the one-time secret from memory before leaving the handover view.
    setResult(null);
    setPhase('form');
    setError(null);
    resetForm();
    onClose();
  };

  const submit = async () => {
    const validation = validateProvisionForm({ name, slug, ownerName, ownerEmail });
    if (validation) { setError(validation); return; }

    setError(null);
    setPhase('submitting');
    try {
      const res = await fetchWithAuth(`${API_BASE}/super-admin/restaurants/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          city: city.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          subscription_plan: plan,
          subscription_status: status,
          owner_name: ownerName.trim(),
          owner_email: ownerEmail.trim(),
          owner_phone: ownerPhone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 201 && data?.ownerStaff?.temporary_pin) {
        setResult(data as ProvisionResponse);
        setPhase('handover');
        onProvisioned();
      } else {
        setError(data?.error || `Provisioning failed (${res.status})`);
        setPhase('form');
      }
    } catch (e: any) {
      setError(e?.message || 'Provisioning request failed');
      setPhase('form');
    }
  };

  const expiryLabel = result?.ownerStaff?.pin_expires_at
    ? new Date(result.ownerStaff.pin_expires_at).toLocaleString()
    : '7 days from issuance';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* ============ FORM PHASE ============ */}
        {phase !== 'handover' && (
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-serif font-bold text-white">Create Restaurant</h2>
                <p className="text-slate-500 text-xs uppercase tracking-widest mt-1">Provisions tenant, manager PIN and owner invitation</p>
              </div>
              <button onClick={onClose} className="p-2 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800 transition-all"><X size={18} /></button>
            </div>

            {error && (
              <div className="mb-6 flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3">
                <AlertTriangle size={16} /> {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={LABEL_CLASS}>Restaurant name *</label>
                <input className={INPUT_CLASS} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bistro Lahore" />
              </div>
              <div>
                <label className={LABEL_CLASS}>Slug (optional)</label>
                <input className={INPUT_CLASS} value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto-generated if empty" />
              </div>
              <div>
                <label className={LABEL_CLASS}>City</label>
                <input className={INPUT_CLASS} value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Karachi" />
              </div>
              <div>
                <label className={LABEL_CLASS}>Phone</label>
                <input className={INPUT_CLASS} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+92-…"
                  autoComplete="off" />
              </div>
              <div>
                <label className={LABEL_CLASS}>Plan</label>
                <select className={INPUT_CLASS} value={plan} onChange={e => setPlan(e.target.value as any)}>
                  {['BASIC', 'STANDARD', 'PREMIUM', 'ENTERPRISE'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Subscription status</label>
                <select className={INPUT_CLASS} value={status} onChange={e => setStatus(e.target.value as any)}>
                  <option value="trial">TRIAL (30 days)</option>
                  <option value="active">ACTIVE</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={LABEL_CLASS}>Address</label>
                <input className={INPUT_CLASS} value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address" />
              </div>
              <div>
                <label className={LABEL_CLASS}>Owner name *</label>
                <input className={INPUT_CLASS} value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <label className={LABEL_CLASS}>Owner email *</label>
                <input className={INPUT_CLASS} value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="owner@example.com"
                  type="email" autoComplete="off" />
              </div>
              <div className="md:col-span-2">
                <label className={LABEL_CLASS}>Owner phone</label>
                <input className={INPUT_CLASS} value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)} placeholder="+92-…"
                  autoComplete="off" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button onClick={onClose} className="px-5 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700 transition-all">Cancel</button>
              <button
                onClick={submit}
                disabled={phase === 'submitting'}
                className="px-6 py-3 rounded-xl text-sm font-black bg-gold-500 hover:bg-gold-600 text-black transition-all shadow-[0_0_20px_rgba(234,179,8,0.25)] disabled:opacity-50 flex items-center gap-2"
              >
                {phase === 'submitting' ? <><Loader2 size={16} className="animate-spin" /> Provisioning…</> : 'Provision & issue PIN'}
              </button>
            </div>
          </div>
        )}

        {/* ============ HANDOVER PHASE (one-time secret) ============ */}
        {phase === 'handover' && result && (
          <div className="p-8">
            <div className="flex items-center justify-between mb-6 print:hidden">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="text-emerald-500" size={24} />
                <h2 className="text-xl font-serif font-bold text-white">Restaurant Provisioned</h2>
              </div>
            </div>

            <div className="print:block hidden">
              <h1 className="text-2xl font-serif font-bold text-black mb-1">FireFlow — Manager Access Handover</h1>
              <p className="text-xs text-black/60 mb-6">Keep this sheet private. FireFlow support can never re-issue this PIN.</p>
            </div>

            <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-5 py-4 mb-6 flex items-start gap-3 print:hidden">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div className="text-sm font-semibold leading-relaxed">
                This PIN is shown <span className="font-black underline">only once</span>. It cannot be retrieved again —
                not by you, not by FireFlow. If it is lost, the manager PIN must be reset from the Vault.
              </div>
            </div>

            <div id="handover-sheet" className="bg-slate-950/60 border border-slate-800 print:bg-white print:border-black/20 rounded-2xl p-6 mb-6">
              <div className="grid grid-cols-2 gap-4 text-sm print:text-black">
                <div><span className="text-slate-500 print:text-black/60 text-[10px] font-black uppercase tracking-widest block mb-1">Restaurant</span><span className="text-white print:text-black font-bold">{result.restaurant.name}</span></div>
                <div><span className="text-slate-500 print:text-black/60 text-[10px] font-black uppercase tracking-widest block mb-1">Slug</span><span className="text-white print:text-black font-bold">{result.restaurant.slug || '—'}</span></div>
                <div><span className="text-slate-500 print:text-black/60 text-[10px] font-black uppercase tracking-widest block mb-1">Manager</span><span className="text-white print:text-black font-bold">{result.ownerStaff.name} ({result.ownerStaff.role})</span></div>
                <div><span className="text-slate-500 print:text-black/60 text-[10px] font-black uppercase tracking-widest block mb-1">PIN expires (unused)</span><span className="text-white print:text-black font-bold">{expiryLabel}</span></div>
              </div>

              <div className="mt-6">
                <span className="text-slate-500 print:text-black/60 text-[10px] font-black uppercase tracking-widest block mb-2">One-time manager PIN</span>
                <div className="flex items-center gap-4 print:hidden">
                  <span className="font-mono text-3xl font-black tracking-[0.4em] text-gold-400 bg-gold-500/10 border border-gold-500/30 rounded-xl px-6 py-3">{result.ownerStaff.temporary_pin}</span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(result.ownerStaff.temporary_pin)}
                    className="p-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
                    title="Copy PIN to clipboard"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <span className="hidden print:inline font-mono text-2xl font-black tracking-[0.4em] text-black">{result.ownerStaff.temporary_pin}</span>
                <p className="text-[11px] text-slate-600 print:text-black/60 mt-3">
                  Manager must change this PIN at first login (enforced from Phase 2 onboarding). Owner invitation email: sent automatically; status visible in the Vault.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 print:hidden">
              <button
                onClick={() => window.print()}
                className="px-5 py-3 rounded-xl text-sm font-bold text-slate-300 border border-slate-700 hover:border-slate-600 transition-all flex items-center gap-2"
              >
                <Printer size={16} /> Print handover sheet
              </button>
              <button
                onClick={dismissSecret}
                className="px-6 py-3 rounded-xl text-sm font-black bg-gold-500 hover:bg-gold-600 text-black transition-all"
              >
                Done — I saved the PIN
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
