
import React, { useState, useEffect } from 'react';
import { useRestaurant, formatCurrency } from '../../client/RestaurantContext';
import { useAppContext } from '../../client/App';
import { Lock, AlertCircle, CreditCard, Phone, Building2, Clock, Loader2, CheckCircle2, LogOut, X } from 'lucide-react';
import { PaymentSubmissionView } from '../../operations/pos/PaymentSubmissionView';
import { getSubscriptionStatus } from '../../shared/lib/cloudClient';

export const SubscriptionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentRestaurant, isSubscriptionActive, daysUntilExpiry, hasPendingPayment } = useRestaurant();
  const { logout } = useAppContext();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<'loading' | 'trial' | 'active' | 'expired' | 'offline'>('loading');
  const [isOffline, setIsOffline] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const cacheKey = currentRestaurant?.id ? `cloud_status_${currentRestaurant.id}` : null;

  useEffect(() => {
    if (!currentRestaurant?.id || currentRestaurant.id === 'SYSTEM') {
      setCloudStatus('active');
      return;
    }

    const validateCloud = async () => {
      if (!cacheKey) return;

      // Check sessionStorage cache first (5 minute cache)
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { status, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < 5 * 60 * 1000) {
            setCloudStatus(status);
            return;
          }
        } catch (e) {
          // Invalid cache, continue
        }
      }

      try {
        // 3 second timeout
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000)
        );
        const result = (await Promise.race([
          getSubscriptionStatus(currentRestaurant.id),
          timeoutPromise
        ])) as any;

        if (result.error) throw new Error(result.error);

        const status = result.data?.status || 'active';
        setCloudStatus(status);
        setIsOffline(false);
        if (cacheKey) {
          sessionStorage.setItem(cacheKey, JSON.stringify({ status, timestamp: Date.now() }));
        }
      } catch (err) {
        // Cloud unreachable — fall back to local data
        setIsOffline(true);
        setCloudStatus((currentRestaurant.subscriptionStatus as any) || 'active');
        console.warn('[SubscriptionGuard] Cloud check failed, using local data:', err);
      }
    };

    validateCloud();
    const interval = setInterval(validateCloud, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currentRestaurant?.id, cacheKey]);
  const subscriptionStatus = currentRestaurant.subscriptionStatus;

  // CASE 1: EXPIRED & PENDING VERIFICATION
  if (subscriptionStatus === 'expired' && hasPendingPayment) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-md w-full text-center space-y-8 animate-in zoom-in duration-500">
          <div className="relative flex justify-center">
            <div className="w-24 h-24 bg-gold-500/10 rounded-full flex items-center justify-center border-2 border-gold-500/30">
              <Clock size={48} className="text-gold-500 animate-[spin_4s_linear_infinite]" />
            </div>
            <div className="absolute -bottom-2 -right-2 bg-slate-950 p-1 rounded-full">
              <div className="bg-blue-500 p-2 rounded-full border-4 border-slate-950">
                <Loader2 size={16} className="text-white animate-spin" />
              </div>
            </div>
          </div>

          <div>
            <h1 className="text-3xl font-serif text-white mb-3">Verification Pending</h1>
            <p className="text-slate-400">
              We've received your payment proof for <span className="text-white font-bold">{currentRestaurant.name}</span>.
              Our team is currently verifying the transaction.
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-left space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded bg-green-900/20 flex items-center justify-center shrink-0">
                <CheckCircle2 size={18} className="text-green-500" />
              </div>
              <div>
                <div className="text-sm font-bold text-white uppercase tracking-wider">Proof Submitted</div>
                <div className="text-xs text-slate-500">Manual verification in progress</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center shrink-0">
                <Clock size={18} className="text-slate-500" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-300 uppercase tracking-wider">Estimated Time</div>
                <div className="text-xs text-slate-500">Usually approved within 12-24 hours</div>
              </div>
            </div>
          </div>

          <div className="pt-4 space-y-6">
            <p className="text-[10px] text-slate-600 uppercase tracking-[0.3em] font-bold">
              Access will be restored automatically
            </p>
            <div className="flex flex-col items-center gap-4">
              <a
                href="tel:03XX-XXXXXXX"
                className="inline-flex items-center gap-2 text-gold-500 hover:text-gold-400 font-bold uppercase tracking-widest text-xs transition-colors"
              >
                <Phone size={14} /> Contact Support
              </a>
              <button
                onClick={logout}
                className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest"
              >
                <LogOut size={14} /> Logout & Switch Account
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // CASE 2: EXPIRED - Show payment screen (BLOCKING)
  if (subscriptionStatus === 'expired' || cloudStatus === 'expired') {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-2xl w-full my-auto">

          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 md:w-24 md:h-24 bg-red-900/20 rounded-full flex items-center justify-center border-4 border-red-900/50">
              <Lock size={48} className="text-red-500" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-serif text-white mb-3">
              Subscription Expired
            </h1>
            <p className="text-slate-400 text-lg">
              Your subscription expired on{' '}
              <span className="text-white font-semibold">
                {new Date(currentRestaurant.subscriptionExpiresAt).toLocaleDateString('en-PK', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              <Building2 className="text-gold-500" size={32} />
              <div>
                <h2 className="text-xl font-bold text-white">{currentRestaurant.name}</h2>
                <p className="text-slate-400 text-sm">{currentRestaurant.city}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
              <div>
                <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Plan</div>
                <div className="text-white font-semibold">{currentRestaurant.subscriptionPlan}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Monthly Fee</div>
                <div className="text-gold-500 font-bold">{formatCurrency(currentRestaurant.monthlyFee || 0)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => setShowPaymentModal(true)}
              className="w-full py-4 bg-gold-500 hover:bg-gold-400 text-black font-bold rounded-lg uppercase tracking-wider transition-all shadow-lg shadow-gold-500/20 flex items-center justify-center gap-2"
            >
              <CreditCard size={20} />
              Submit Payment Now
            </button>

            <button
              onClick={logout}
              className="bg-slate-800/50 border border-slate-700 hover:bg-slate-800 hover:border-slate-600 rounded-xl p-4 flex flex-col justify-center items-center text-center transition-colors"
            >
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1 uppercase font-bold tracking-widest">
                <LogOut size={14} />
                <span>Logout</span>
              </div>
              <span className="text-slate-500 text-xs">Switch to another account</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2 uppercase text-xs tracking-widest">
              <Building2 size={16} className="text-gold-500" />
              Direct Transfer Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-3">
                <div>
                  <div className="text-slate-500 mb-1">JazzCash / EasyPaisa:</div>
                  <div className="bg-slate-950 border border-slate-800 rounded p-2 font-mono text-gold-400">03XX-1234567</div>
                </div>
                <div>
                  <div className="text-slate-500 mb-1">Account Title:</div>
                  <div className="bg-slate-950 border border-slate-800 rounded p-2 text-slate-300">Cravex Solutions</div>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-slate-500 mb-1">Bank (Meezan):</div>
                  <div className="bg-slate-950 border border-slate-800 rounded p-2 font-mono text-gold-400 text-[10px]">PK36MEZN0003240103123456</div>
                </div>
                <div>
                  <div className="text-slate-500 mb-1">Reference:</div>
                  <div className="bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 font-mono">{currentRestaurant.slug || 'N/A'}</div>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-slate-600 text-[10px] uppercase tracking-widest">
            After submission, approval takes up to 24 hours.
          </p>
        </div>

        {showPaymentModal && (
          <div className="fixed inset-0 z-[110] bg-black/95 animate-in fade-in duration-300">
            <PaymentSubmissionView
              onClose={() => setShowPaymentModal(false)}
              isModal={true}
            />
          </div>
        )}
      </div>
    );
  }

  // CASE 3: EXPIRING SOON (7 days or less) - Add banner but allow app access
  if (daysUntilExpiry <= 7 && daysUntilExpiry > 0 && isSubscriptionActive) {
    return (
      <>
        {/* Offline Warning Banner */}
        {isOffline && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-900/80 border-b border-yellow-500/50 px-4 py-2 text-center text-yellow-300 text-xs">
            ⚠️ Offline mode — subscription validation unavailable. Connect to internet to verify your subscription.
          </div>
        )}

        <div className={`fixed top-0 left-0 right-0 z-[60] bg-yellow-900/90 backdrop-blur-sm border-b border-yellow-900/50 px-4 md:px-6 py-3 ${isOffline ? 'mt-10' : ''}`}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-yellow-500 shrink-0" size={20} />
              <span className="text-yellow-200 text-sm font-medium text-center md:text-left">
                {daysUntilExpiry === 1
                  ? 'Your subscription expires tomorrow!'
                  : `Your subscription expires in ${daysUntilExpiry} days.`}
                {' '}Renew now to avoid service interruption.
              </span>
            </div>
            <button
              onClick={() => setShowPaymentModal(true)}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-black rounded-lg text-sm font-bold uppercase tracking-wider transition-colors shrink-0 shadow-lg"
            >
              Renew Now
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden pt-14">
          {children}
        </div>

        {showPaymentModal && (
          <div className="fixed inset-0 z-[110] bg-black/95 animate-in fade-in duration-300">
            <PaymentSubmissionView
              onClose={() => setShowPaymentModal(false)}
              isModal={true}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Offline Warning Banner */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-900/80 border-b border-yellow-500/50 px-4 py-2 text-center text-yellow-300 text-xs">
          ⚠️ Offline mode — subscription validation unavailable. Connect to internet to verify your subscription.
        </div>
      )}

      {/* Trial Expiry Warning Banner */}
      {cloudStatus === 'trial' &&
        daysUntilExpiry <= 5 &&
        daysUntilExpiry > 0 &&
        !sessionStorage.getItem('trial_banner_dismissed') &&
        !bannerDismissed && (
          <div className={`fixed top-0 left-0 right-0 z-50 bg-amber-500 px-4 py-2 flex items-center justify-between ${isOffline ? 'mt-10' : ''}`}>
            <span className="text-slate-900 font-semibold text-sm">
              ⚠️ Your trial ends in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}. Submit payment to continue uninterrupted.
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPaymentModal(true)}
                className="bg-slate-900 text-white text-xs px-3 py-1 rounded font-bold hover:bg-slate-800"
              >
                Pay Now
              </button>
              <button
                onClick={() => {
                  sessionStorage.setItem('trial_banner_dismissed', 'true');
                  setBannerDismissed(true);
                }}
                className="text-slate-900 hover:text-slate-700 font-bold text-lg leading-none"
              >
                ✕
              </button>
            </div>
          </div>
        )}

      <div className="flex-1 flex flex-col overflow-hidden">{children}</div>

      {showPaymentModal && (
        <div className="fixed inset-0 z-[110] bg-black/95 animate-in fade-in duration-300">
          <PaymentSubmissionView onClose={() => setShowPaymentModal(false)} isModal={true} />
        </div>
      )}
    </>
  );
};
