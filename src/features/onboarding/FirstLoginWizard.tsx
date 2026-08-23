import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Lock, LogOut, ShieldCheck, Store } from 'lucide-react';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';
import { deriveWizardSteps, isSetupFinished, wizardErrorMessage, WizardStepId } from './wizardLogic';

// ==========================================
// PHASE 2 — FIRST-LOGIN WIZARD
// ==========================================
// Rendered INSTEAD of the application shell while the server reports a
// forced PIN change or SETUP_INCOMPLETE tenant. The server-side setup gate
// remains the final authority; this view is the guided path through it.
//
// Secret handling: old/new PINs live only in this component's React memory
// (controlled inputs), are never persisted, logged, or placed in URLs, and
// are cleared as soon as each step completes or the wizard unmounts.

interface FirstLoginWizardProps {
  restaurantName?: string;
  staffName?: string;
  pinChangeRequired: boolean;
  onCompleted: () => void;
  onLogout: () => void;
}

const API_BASE = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

export const FirstLoginWizard: React.FC<FirstLoginWizardProps> = ({
  restaurantName,
  staffName,
  pinChangeRequired,
  onCompleted,
  onLogout
}) => {
  const [requirements, setRequirements] = useState<{ pin_change_required: boolean; profile_fields?: Record<string, boolean> }>({
    pin_change_required: pinChangeRequired
  });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // PIN inputs — memory-only
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Profile inputs — memory-only
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/onboarding/status`);
        const data = await res.json();
        if (!cancelled && res.ok) {
          setRequirements({
            pin_change_required: data.requirements?.pin_change_required === true,
            profile_fields: data.requirements?.profile_fields
          });
          if (isSetupFinished(data, data.requirements?.pin_change_required)) {
            setDone(true);
          }
        }
      } catch {
        // status endpoint unreachable → server gate will still protect routes;
        // keep default requirements from login response.
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear any typed secrets when leaving the PIN step or unmounting.
  useEffect(() => {
    return () => { setOldPin(''); setNewPin(''); setConfirmPin(''); };
  }, []);
  useEffect(() => {
    if (stepIndex !== pinStepOffset()) { setOldPin(''); setNewPin(''); setConfirmPin(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const steps = useMemo(() => deriveWizardSteps(requirements), [requirements]);
  const pinStepOffset = () => (requirements.pin_change_required ? 0 : -1);
  const currentStep: WizardStepId = steps[Math.min(stepIndex, steps.length - 1)]?.id ?? 'review';

  const submitPinChange = async () => {
    setError(null);
    if (!/^\d{6}$/.test(newPin)) { setError('New PIN must be exactly 6 digits.'); return; }
    if (newPin !== confirmPin) { setError('New PIN and confirmation do not match.'); return; }
    setBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/auth/change-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_pin: oldPin, new_pin: newPin })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOldPin(''); setNewPin(''); setConfirmPin('');
        setRequirements(r => ({ ...r, pin_change_required: false }));
        setStepIndex(i => i + 1);
      } else {
        setError(data?.error || `PIN change failed (${res.status})`);
      }
    } catch (e: any) {
      setError(e?.message || 'PIN change request failed');
    } finally {
      setBusy(false);
    }
  };

  const submitProfile = async () => {
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, string> = {};
      if (address.trim()) body.address = address.trim();
      if (phone.trim()) body.phone = phone.trim();
      if (Object.keys(body).length > 0) {
        const res = await fetchWithAuth(`${API_BASE}/onboarding/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data?.error || `Profile update failed (${res.status})`);
          return;
        }
      }
      setStepIndex(i => i + 1);
    } catch (e: any) {
      setError(e?.message || 'Profile update request failed');
    } finally {
      setBusy(false);
    }
  };

  const submitComplete = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/onboarding/complete`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
        setTimeout(onCompleted, 900);
      } else if (data?.code === 'ALREADY_ACTIVE') {
        setDone(true);            // someone else finished setup — proceed
        setTimeout(onCompleted, 900);
      } else if (data?.code === 'PIN_CHANGE_REQUIRED') {
        setRequirements(r => ({ ...r, pin_change_required: true }));
        setStepIndex(pinStepOffset() < 0 ? 0 : 0);
        setError(wizardErrorMessage('PIN_CHANGE_REQUIRED', data.error));
      } else {
        setError(wizardErrorMessage(data?.code, data?.error || `Completion failed (${res.status})`));
      }
    } catch (e: any) {
      setError(e?.message || 'Completion request failed');
    } finally {
      setBusy(false);
    }
  };

  const primaryAction = async () => {
    if (currentStep === 'change_pin') return submitPinChange();
    if (currentStep === 'profile') return submitProfile();
    return submitComplete();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gold-500/10 border border-gold-500/30 mb-4">
            <ShieldCheck className="text-gold-500" size={26} />
          </div>
          <h1 className="text-2xl font-serif font-bold text-white">Welcome{staffName ? `, ${staffName}` : ''}</h1>
          <p className="text-slate-500 text-xs font-black uppercase tracking-widest mt-2">
            {restaurantName ? `${restaurantName} — ` : ''}First-login setup
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {steps.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border transition-all ${
                done || i < stepIndex ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : i === stepIndex ? 'bg-gold-500/20 border-gold-500/50 text-gold-400'
                    : 'bg-slate-900 border-slate-800 text-slate-600'}`}>
                {done || i < stepIndex ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-px ${i < stepIndex || done ? 'bg-emerald-500/40' : 'bg-slate-800'}`} />}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-7">
          {error && (
            <div className="mb-5 bg-red-500/10 border border-red-500/25 text-red-300 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          {loadingStatus ? (
            <div className="flex items-center gap-3 text-slate-400 text-sm py-6"><Loader2 className="animate-spin" size={16} /> Loading setup status…</div>
          ) : done ? (
            <div className="text-center py-6">
              <CheckCircle2 className="text-emerald-500 mx-auto mb-3" size={32} />
              <p className="text-white font-bold">Setup complete</p>
              <p className="text-slate-500 text-sm mt-1">Opening your workspace…</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                {currentStep === 'change_pin' && <Lock className="text-gold-500" size={16} />}
                {currentStep === 'profile' && <Store className="text-gold-500" size={16} />}
                {currentStep === 'review' && <ShieldCheck className="text-gold-500" size={16} />}
                <h2 className="text-lg font-serif font-bold text-white">{steps[Math.min(stepIndex, steps.length - 1)]?.title}</h2>
              </div>
              <p className="text-slate-500 text-sm mb-6">{steps[Math.min(stepIndex, steps.length - 1)]?.description}</p>

              {currentStep === 'change_pin' && (
                <div className="space-y-4">
                  <input
                    type="password" inputMode="numeric" autoComplete="off"
                    placeholder="Temporary PIN (shown on handover sheet)"
                    value={oldPin} onChange={e => setOldPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-white tracking-widest outline-none focus:border-gold-500/50"
                  />
                  <input
                    type="password" inputMode="numeric" autoComplete="new-password"
                    placeholder="New 6-digit PIN"
                    value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-white tracking-widest outline-none focus:border-gold-500/50"
                  />
                  <input
                    type="password" inputMode="numeric" autoComplete="new-password"
                    placeholder="Confirm new PIN"
                    value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-white tracking-widest outline-none focus:border-gold-500/50"
                  />
                  <p className="text-[11px] text-slate-600">Your new PIN replaces the temporary one permanently. It is stored only as a secure hash.</p>
                </div>
              )}

              {currentStep === 'profile' && (
                <div className="space-y-4">
                  <input
                    type="text" autoComplete="off" placeholder="Street address"
                    value={address} onChange={e => setAddress(e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:border-gold-500/50"
                  />
                  <input
                    type="tel" autoComplete="off" placeholder="Phone (+92-…)"
                    value={phone} onChange={e => setPhone(e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:border-gold-500/50"
                  />
                  <p className="text-[11px] text-slate-600">You can update these later in settings. Name and city were configured during provisioning.</p>
                </div>
              )}

              {currentStep === 'review' && (
                <div className="text-sm text-slate-400 space-y-2">
                  <p>• Your PIN is personal — never share it.</p>
                  <p>• FireFlow support can issue a replacement PIN if it is ever lost.</p>
                  <p>• Completing setup activates your workspace for daily operations.</p>
                </div>
              )}

              <button
                onClick={primaryAction}
                disabled={busy}
                className="mt-7 w-full py-3.5 rounded-xl text-sm font-black bg-gold-500 hover:bg-gold-600 text-black transition-all shadow-[0_0_20px_rgba(234,179,8,0.25)] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : currentStep === 'change_pin' ? 'Set new PIN' : currentStep === 'profile' ? 'Save details' : 'Complete setup'}
              </button>
            </>
          )}
        </div>

        <button
          onClick={onLogout}
          className="mt-6 mx-auto flex items-center gap-2 text-slate-600 hover:text-slate-400 text-xs font-black uppercase tracking-widest transition-all"
        >
          <LogOut size={13} /> Log out instead
        </button>
      </div>
    </div>
  );
};
