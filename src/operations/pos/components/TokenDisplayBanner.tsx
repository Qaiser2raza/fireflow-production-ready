import React from 'react';
import { CheckCircle2, Clock, Printer } from 'lucide-react';
import { formatTokenDisplay, formatPickupTime } from '../../../utils/tokenGenerator';

interface TokenDisplayBannerProps {
    token: string;
    estimatedReadyTime?: Date;
    onPrintToken?: () => void;
    onNewOrder?: () => void;
}

export const TokenDisplayBanner: React.FC<TokenDisplayBannerProps> = ({
    token,
    estimatedReadyTime,
    onPrintToken,
    onNewOrder
}) => {
    const displayToken = formatTokenDisplay(token);
    const readyTimeStr = estimatedReadyTime ? formatPickupTime(estimatedReadyTime) : null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-lg z-50 flex items-center justify-center animate-in fade-in duration-300">
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border-4 border-gold-500 rounded-[3rem] p-12 max-w-2xl w-full mx-4 shadow-2xl shadow-gold-500/20 animate-in zoom-in duration-500">

                {/* Success Icon */}
                <div className="flex justify-center mb-8">
                    <div className="w-20 h-20 bg-green-500/10 border-4 border-green-500 rounded-full flex items-center justify-center animate-in zoom-in duration-700 delay-200">
                        <CheckCircle2 size={48} className="text-green-500" />
                    </div>
                </div>

                {/* Title */}
                <h2 className="text-center text-slate-400 text-sm font-black uppercase tracking-[0.3em] mb-6 animate-in slide-in-from-top duration-500 delay-300">
                    Order Sent to Kitchen
                </h2>

                {/* Token Number - Large Display */}
                <div className="bg-gradient-to-br from-gold-500/5 to-gold-500/10 border-4 border-gold-500/30 rounded-3xl p-12 mb-8 animate-in zoom-in duration-700 delay-400">
                    <div className="text-center">
                        <div className="text-gold-500/60 text-xs font-black uppercase tracking-[0.4em] mb-4">
                            Token Number
                        </div>
                        <div className="text-8xl font-black text-gold-500 tracking-[0.3em] font-mono drop-shadow-2xl animate-pulse">
                            {displayToken}
                        </div>
                    </div>
                </div>

                {/* Estimated Ready Time */}
                {readyTimeStr && (
                    <div className="flex items-center justify-center gap-3 mb-10 text-slate-300 animate-in slide-in-from-bottom duration-500 delay-500">
                        <Clock size={20} className="text-blue-400" />
                        <span className="text-sm font-bold">
                            Estimated Ready Time:
                        </span>
                        <span className="text-xl font-black text-blue-400">
                            {readyTimeStr}
                        </span>
                    </div>
                )}

                {/* Instructions */}
                <p className="text-center text-slate-500 text-sm mb-8 leading-relaxed animate-in fade-in duration-500 delay-600">
                    Please inform the customer of their token number.
                    <br />
                    They will be notified when their order is ready.
                </p>

                {/* Action Buttons */}
                <div className="flex gap-4 animate-in slide-in-from-bottom duration-500 delay-700">
                    {onPrintToken && (
                        <button
                            onClick={onPrintToken}
                            className="flex-1 h-16 bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 hover:border-slate-600 text-slate-300 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-3 group">
                            <Printer size={20} className="group-hover:scale-110 transition-transform" />
                            Print Token
                        </button>
                    )}

                    <button
                        onClick={onNewOrder}
                        className="flex-1 h-16 bg-gradient-to-r from-gold-500 to-yellow-500 hover:from-gold-400 hover:to-yellow-400 text-black rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-gold-500/20 hover:shadow-gold-500/40 hover:scale-[1.02] active:scale-[0.98]">
                        New Order
                    </button>
                </div>

            </div>
        </div>
    );
};
