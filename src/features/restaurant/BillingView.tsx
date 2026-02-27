import React, { useState, useEffect } from 'react';
import { useRestaurant, formatCurrency } from '../../client/RestaurantContext';
import { useAppContext } from '../../client/App';
import { getPaymentHistory, getSubscriptionStatus } from '../../shared/lib/cloudClient';
import {
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronRight,
  Calendar,
  DollarSign,
  Building2,
  Zap,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { PaymentSubmissionView } from '../../operations/pos/PaymentSubmissionView';

interface PaymentRecord {
  id: string;
  restaurant_id: string;
  amount: number;
  payment_method: string;
  payment_proof_url: string;
  status: 'pending' | 'verified' | 'rejected';
  transaction_id: string | null;
  verified_at: string | null;
  created_at: string;
}

export const BillingView: React.FC = () => {
  const { currentRestaurant, daysUntilExpiry, isSubscriptionActive, hasPendingPayment } = useRestaurant();
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [cloudStatus, setCloudStatus] = useState<'trial' | 'active' | 'expired' | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    if (!currentRestaurant?.id) return;

    const loadBillingData = async () => {
      setLoading(true);
      try {
        // Fetch payment history
        const historyResult = await getPaymentHistory(currentRestaurant.id);
        if (historyResult.data) {
          setPaymentHistory(historyResult.data);
        }

        // Fetch subscription status
        const statusResult = await getSubscriptionStatus(currentRestaurant.id);
        if (statusResult.data?.status) {
          setCloudStatus(statusResult.data.status);
        }
      } catch (err) {
        console.error('Failed to load billing data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadBillingData();
  }, [currentRestaurant?.id]);

  if (!currentRestaurant) {
    return <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-slate-400">No restaurant data</div>;
  }

  const statusDisplay = cloudStatus || currentRestaurant.subscriptionStatus;

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden text-slate-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-950 border-b border-slate-800 p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 bg-gold-500/10 rounded-xl flex items-center justify-center border border-gold-500/30">
              <CreditCard size={24} className="text-gold-500" />
            </div>
            <div>
              <h1 className="text-3xl font-serif font-bold text-white">Billing & Subscription</h1>
              <p className="text-slate-400 text-sm">{currentRestaurant.name}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-8">
          {/* Subscription Status Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Current Plan */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">Current Plan</h2>
                <div
                  className={`text-xs font-bold uppercase px-3 py-1 rounded-full border ${
                    statusDisplay === 'trial'
                      ? 'bg-amber-900/20 text-amber-400 border-amber-900/50'
                      : statusDisplay === 'active'
                        ? 'bg-green-900/20 text-green-400 border-green-900/50'
                        : 'bg-red-900/20 text-red-400 border-red-900/50'
                  }`}
                >
                  {statusDisplay === 'trial' ? 'Trial' : statusDisplay === 'active' ? 'Active' : 'Expired'}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Plan Name</div>
                  <div className="text-2xl font-bold text-white">{currentRestaurant.subscriptionPlan}</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Monthly Fee</div>
                    <div className="text-xl font-bold text-gold-500">{formatCurrency(currentRestaurant.monthlyFee || 0)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Currency</div>
                    <div className="text-xl font-bold text-slate-300">{currentRestaurant.currency}</div>
                  </div>
                </div>

                {statusDisplay === 'trial' && daysUntilExpiry > 0 && (
                  <div className="bg-amber-900/20 border border-amber-900/50 rounded-lg p-4 flex items-center gap-3">
                    <Clock size={18} className="text-amber-400 shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-amber-300">Trial ends in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}</div>
                      <div className="text-xs text-amber-300/70">Submit payment to continue after trial</div>
                    </div>
                  </div>
                )}

                {statusDisplay === 'expired' && (
                  <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4 flex items-center gap-3">
                    <AlertCircle size={18} className="text-red-400 shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-red-300">Subscription Expired</div>
                      <div className="text-xs text-red-300/70">Submit payment to restore access</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Expiry Information */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-4">Expiry Information</h2>

              <div className="space-y-4">
                <div>
                  <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">
                    {statusDisplay === 'trial' ? 'Trial Expires' : 'Subscription Expires'}
                  </div>
                  <div className="text-xl font-bold text-white flex items-center gap-2">
                    <Calendar size={18} className="text-gold-500" />
                    {new Date(currentRestaurant.subscriptionExpiresAt).toLocaleDateString('en-PK', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </div>

                {statusDisplay === 'trial' && daysUntilExpiry > 0 && (
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-slate-400 uppercase font-bold">Time Remaining</div>
                      <div className="text-lg font-bold text-gold-500">{daysUntilExpiry}d</div>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-gold-500 to-gold-600 h-2 rounded-full"
                        style={{ width: `${Math.max(0, (daysUntilExpiry / 14) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="w-full mt-4 py-3 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-400 hover:to-gold-500 text-slate-950 rounded-lg font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 transition-all shadow-lg"
                >
                  <CreditCard size={18} />
                  {statusDisplay === 'expired' ? 'Submit Payment' : 'Renew Subscription'}
                </button>
              </div>
            </div>
          </div>

          {/* Payment Submission Details */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Building2 size={20} className="text-gold-500" />
              Payment Instructions
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Mobile Wallets</h3>
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="text-slate-500 mb-1">JazzCash / EasyPaisa:</div>
                    <div className="bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono text-gold-400">03XX-1234567</div>
                  </div>
                  <div>
                    <div className="text-slate-500 mb-1">Account Name:</div>
                    <div className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-300">Fireflow Solutions</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Bank Transfer</h3>
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="text-slate-500 mb-1">IBAN (Meezan Bank):</div>
                    <div className="bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono text-gold-400 text-[10px]">
                      PK36MEZN0003240103123456
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 mb-1">Reference:</div>
                    <div className="bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono text-slate-300">{currentRestaurant.slug || 'N/A'}</div>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 mt-4 border-t border-slate-800 pt-4">
              After making a payment, click "Submit Payment" above to upload proof. Verification typically takes 12-24 hours.
            </p>
          </div>

          {/* Payment History */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white uppercase tracking-wider">Payment History</h2>
            </div>

            {loading ? (
              <div className="p-12 flex items-center justify-center text-slate-500">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : paymentHistory.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">No payment history yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-t border-slate-800 bg-slate-800/50">
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase text-slate-400 tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase text-slate-400 tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase text-slate-400 tracking-wider">Method</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase text-slate-400 tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map(payment => (
                      <tr key={payment.id} className="border-t border-slate-800 hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4 text-sm">
                          {new Date(payment.created_at).toLocaleDateString('en-PK', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-gold-400">Rs. {payment.amount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-slate-400">{payment.payment_method}</td>
                        <td className="px-6 py-4 text-sm">
                          <div
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase border ${
                              payment.status === 'verified'
                                ? 'bg-green-900/20 text-green-400 border-green-900/50'
                                : payment.status === 'pending'
                                  ? 'bg-amber-900/20 text-amber-400 border-amber-900/50'
                                  : 'bg-red-900/20 text-red-400 border-red-900/50'
                            }`}
                          >
                            {payment.status === 'verified' && <CheckCircle2 size={12} />}
                            {payment.status === 'pending' && <Clock size={12} />}
                            {payment.status === 'rejected' && <XCircle size={12} />}
                            {payment.status}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Plan Features */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
              <Zap size={20} className="text-gold-500" />
              Plan Features
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentRestaurant.subscriptionPlan === 'BASIC' && (
                <>
                  <FeatureItem label="POS System" included={true} />
                  <FeatureItem label="Kitchen Display System (KDS)" included={true} />
                  <FeatureItem label="Basic Reports" included={true} />
                  <FeatureItem label="Staff Management (3 users)" included={true} />
                  <FeatureItem label="Floor Management" included={false} />
                  <FeatureItem label="Advanced Analytics" included={false} />
                </>
              )}
              {currentRestaurant.subscriptionPlan === 'STANDARD' && (
                <>
                  <FeatureItem label="POS System" included={true} />
                  <FeatureItem label="Kitchen Display System (KDS)" included={true} />
                  <FeatureItem label="Basic Reports" included={true} />
                  <FeatureItem label="Staff Management (10 users)" included={true} />
                  <FeatureItem label="Floor Management" included={true} />
                  <FeatureItem label="Inventory Tracking" included={true} />
                  <FeatureItem label="Advanced Analytics" included={false} />
                  <FeatureItem label="Priority Support" included={false} />
                </>
              )}
              {currentRestaurant.subscriptionPlan === 'PREMIUM' && (
                <>
                  <FeatureItem label="POS System" included={true} />
                  <FeatureItem label="Kitchen Display System (KDS)" included={true} />
                  <FeatureItem label="Advanced Reports" included={true} />
                  <FeatureItem label="Unlimited Staff" included={true} />
                  <FeatureItem label="Floor Management" included={true} />
                  <FeatureItem label="Inventory Tracking" included={true} />
                  <FeatureItem label="Advanced Analytics" included={true} />
                  <FeatureItem label="Priority Support 24/7" included={true} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[110] bg-black/95 animate-in fade-in duration-300">
          <PaymentSubmissionView onClose={() => setShowPaymentModal(false)} isModal={true} />
        </div>
      )}
    </div>
  );
};

const FeatureItem: React.FC<{ label: string; included: boolean }> = ({ label, included }) => (
  <div
    className={`flex items-center gap-3 p-3 rounded-lg border ${
      included ? 'bg-green-900/10 border-green-900/30 text-green-400' : 'bg-slate-800/50 border-slate-700 text-slate-500'
    }`}
  >
    {included ? <CheckCircle2 size={18} className="shrink-0" /> : <XCircle size={18} className="shrink-0" />}
    <span className="text-sm font-medium">{label}</span>
  </div>
);
