
import React, { useState } from 'react';
import { useRestaurant } from '../../client/RestaurantContext';
import { useAppContext } from '../../client/App';
import { supabase } from '../../lib/supabase';
import { Upload, CreditCard, Building2, CheckCircle2, AlertCircle, X, Loader2, LogOut } from 'lucide-react';

interface PaymentSubmissionViewProps {
  onClose?: () => void;
  isModal?: boolean;
}

export const PaymentSubmissionView: React.FC<PaymentSubmissionViewProps> = ({ 
  onClose, 
  isModal = false 
}) => {
  const { currentRestaurant, refreshPendingStatus } = useRestaurant();
  const { logout } = useAppContext();
  const [paymentMethod, setPaymentMethod] = useState<'jazzcash' | 'bank'>('jazzcash');
  const [transactionId, setTransactionId] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPG, PNG)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      return;
    }

    setImageFile(file);
    setError('');

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!imageFile || !transactionId) {
      setError('Please upload payment proof and enter transaction ID');
      return;
    }

    if (!currentRestaurant) {
      setError('Restaurant context not found');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        const base64Image = reader.result as string;

        const { error: dbError } = await supabase
          .from('subscription_payments')
          .insert({
            restaurant_id: currentRestaurant.id,
            amount: currentRestaurant.monthlyFee,
            payment_method: paymentMethod,
            transaction_id: transactionId,
            payment_proof: base64Image,
            status: 'pending'
          });

        if (dbError) {
          console.error('Submission error FULL DETAILS:', JSON.stringify(dbError, null, 2));
          
          let errorMsg = 'Database connection failed.';
          if (dbError.message) errorMsg = dbError.message;
          else if (typeof dbError === 'string') errorMsg = dbError;
          else errorMsg = JSON.stringify(dbError);

          setError(`Database Error: ${errorMsg}`);
          setIsSubmitting(false);
          return;
        }

        // Successfully submitted - update context state
        await refreshPendingStatus();
        
        setSubmitSuccess(true);
        setIsSubmitting(false);

        if (isModal && onClose) {
          // Keep success screen visible for a bit longer
          setTimeout(() => {
            onClose();
          }, 5000);
        }
      };

      reader.onerror = () => {
        setError('Failed to read image file');
        setIsSubmitting(false);
      };

      reader.readAsDataURL(imageFile);
    } catch (err: any) {
      console.error('Submission catch error:', err);
      const catchMsg = err?.message || JSON.stringify(err) || 'An unexpected error occurred';
      setError(`Error: ${catchMsg}`);
      setIsSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-950 p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-green-900/20 border-2 border-green-500 flex items-center justify-center mb-6 animate-in zoom-in">
          <CheckCircle2 size={48} className="text-green-500" />
        </div>
        <h2 className="text-2xl font-serif text-white mb-2">Payment Submitted!</h2>
        <p className="text-slate-400 max-w-md mb-8">
          Your payment proof has been submitted for verification. You will be notified once approved (usually within 24 hours).
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
          {isModal && onClose && (
            <button 
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold uppercase tracking-wider transition-colors"
            >
              Done
            </button>
          )}
          <button 
            onClick={logout}
            className="flex-1 px-6 py-3 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white rounded-lg font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
          >
            <LogOut size={18} /> Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-slate-950 overflow-y-auto ${isModal ? 'p-4 md:p-8 pt-16 relative' : 'p-8'}`}>
      {isModal && onClose && (
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-slate-500 hover:text-white z-50 p-2 bg-slate-900 rounded-full border border-slate-800"
        >
          <X size={24} />
        </button>
      )}

      <div className="max-w-2xl mx-auto w-full space-y-6 pb-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif text-white mb-2">Submit Payment Proof</h1>
          <p className="text-slate-400">
            Upload your JazzCash or Bank transfer screenshot to renew your subscription
          </p>
        </div>

        <div className="bg-gradient-to-r from-gold-500 to-gold-600 p-6 rounded-xl text-center shadow-lg shadow-gold-500/20">
          <div className="text-sm text-black/60 uppercase tracking-wider mb-1 font-bold">Amount to Pay</div>
          <div className="text-4xl font-serif font-bold text-black">
            Rs. {currentRestaurant?.monthlyFee?.toLocaleString()}
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-2 block">
            Payment Method
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setPaymentMethod('jazzcash')}
              className={`p-6 rounded-xl border-2 transition-all flex flex-col items-center text-center ${
                paymentMethod === 'jazzcash'
                  ? 'border-gold-500 bg-gold-500/10'
                  : 'border-slate-800 bg-slate-900 hover:border-slate-700'
              }`}
            >
              <CreditCard size={32} className={paymentMethod === 'jazzcash' ? 'text-gold-500' : 'text-slate-500'} />
              <div className="mt-3 font-bold text-white">JazzCash</div>
              <div className="text-xs text-slate-500 mt-1">03XX-1234567</div>
            </button>

            <button
              onClick={() => setPaymentMethod('bank')}
              className={`p-6 rounded-xl border-2 transition-all flex flex-col items-center text-center ${
                paymentMethod === 'bank'
                  ? 'border-gold-500 bg-gold-500/10'
                  : 'border-slate-800 bg-slate-900 hover:border-slate-700'
              }`}
            >
              <Building2 size={32} className={paymentMethod === 'bank' ? 'text-gold-500' : 'text-slate-500'} />
              <div className="mt-3 font-bold text-white">Bank Transfer</div>
              <div className="text-xs text-slate-500 mt-1">IBAN Transfer</div>
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="text-sm font-bold text-gold-500 uppercase tracking-wider mb-4">
            Transfer to:
          </div>
          {paymentMethod === 'jazzcash' ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">JazzCash Number:</span>
                <span className="font-mono text-white font-bold">03XX-1234567</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">Account Title:</span>
                <span className="text-white font-bold">Fireflow Solutions</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">Bank:</span>
                <span className="text-white font-bold">Meezan Bank</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">Account Title:</span>
                <span className="text-white font-bold">Fireflow Solutions</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">IBAN:</span>
                <span className="font-mono text-white text-xs">PK36MEZN0003240103123456</span>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-2 block">
            Transaction ID / Reference Number
          </label>
          <input
            type="text"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder="e.g. JC1234567890 or TXN9876543210"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-4 text-white outline-none focus:border-gold-500 transition-colors"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-2 block">
            Upload Payment Screenshot
          </label>
          
          {!imagePreview ? (
            <label className="block w-full h-48 border-2 border-dashed border-slate-800 rounded-xl hover:border-gold-500 transition-colors cursor-pointer group bg-slate-900/50">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="h-full flex flex-col items-center justify-center text-slate-500 group-hover:text-gold-500">
                <Upload size={48} className="mb-4" />
                <div className="font-bold">Click to upload</div>
                <div className="text-xs mt-2">JPG, PNG (Max 5MB)</div>
              </div>
            </label>
          ) : (
            <div className="relative">
              <img 
                src={imagePreview} 
                alt="Payment proof" 
                className="w-full h-64 object-contain bg-slate-950 rounded-xl border border-slate-800"
              />
              <button
                onClick={() => {
                  setImageFile(null);
                  setImagePreview('');
                }}
                className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-lg"
              >
                <X size={20} />
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-900/50 text-red-400 p-4 rounded-lg flex items-start gap-3 animate-in fade-in">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <div className="text-sm">{error}</div>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !imageFile || !transactionId}
          className={`w-full h-14 rounded-xl font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-3 ${
            isSubmitting || !imageFile || !transactionId
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-gold-500 to-gold-600 text-black hover:shadow-lg hover:shadow-gold-500/20'
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <CheckCircle2 size={20} />
              Submit for Verification
            </>
          )}
        </button>
      </div>
    </div>
  );
};
