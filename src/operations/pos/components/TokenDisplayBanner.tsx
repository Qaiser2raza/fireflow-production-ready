import React from 'react';
import { CheckCircle2, Clock, Printer } from 'lucide-react';
import { formatTokenDisplay, formatPickupTime } from '../../../utils/tokenGenerator';
import { Barcode } from '../../../shared/components/Barcode';

interface TokenDisplayBannerProps {
    token: string;
    orderNumber?: string;
    orderType: string;
    estimatedReadyTime?: Date;
    onPrintToken?: () => void;
    onNewOrder?: () => void;
}

export const TokenDisplayBanner: React.FC<TokenDisplayBannerProps> = ({
    token,
    orderNumber,
    orderType,
    estimatedReadyTime,
    onPrintToken,
    onNewOrder
}) => {
    const displayToken = formatTokenDisplay(token);
    const readyTimeStr = estimatedReadyTime ? formatPickupTime(estimatedReadyTime) : null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-lg z-[100] flex items-center justify-center animate-in fade-in duration-300 p-4 font-sans">
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border-4 border-gold-500 rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 max-w-2xl w-full mx-auto shadow-2xl shadow-gold-500/20 animate-in zoom-in duration-500 overflow-y-auto max-h-[90vh] flex flex-col custom-scrollbar">

                {/* Success Icon */}
                <div className="flex justify-center mb-6 md:mb-8">
                    <div className="w-16 h-16 md:w-20 md:h-20 bg-green-500/10 border-4 border-green-500 rounded-full flex items-center justify-center animate-in zoom-in duration-700 delay-200">
                        <CheckCircle2 size={32} className="md:size-[48px] text-green-500" />
                    </div>
                </div>

                {/* Title */}
                <h2 className="text-center text-slate-400 text-[10px] md:text-sm font-black uppercase tracking-[0.3em] mb-4 md:mb-6 animate-in slide-in-from-top duration-500 delay-300">
                    Order Sent to Kitchen
                </h2>

                {/* Token Number - Large Display */}
                <div className="bg-gradient-to-br from-gold-500/5 to-gold-500/10 border-4 border-gold-500/30 rounded-2xl md:rounded-3xl p-6 md:p-12 mb-6 md:mb-8 animate-in zoom-in duration-700 delay-400">
                    <div className="text-center">
                        <div className="text-gold-500/60 text-[8px] md:text-xs font-black uppercase tracking-[0.4em] mb-2 md:mb-4">
                            Token Number
                        </div>
                        <div className="text-5xl md:text-8xl font-black text-gold-500 tracking-[0.2em] md:tracking-[0.3em] font-mono drop-shadow-2xl animate-pulse">
                            {displayToken}
                        </div>
                        
                        {orderNumber && (
                            <div className="mt-6 md:mt-10 flex flex-col items-center opacity-80 hover:opacity-100 transition-opacity">
                                <div className="bg-white p-3 rounded-xl shadow-inner mb-2">
                                    <Barcode value={orderNumber} height={40} width={1.5} showText={false} />
                                </div>
                                <div className="text-[8px] md:text-[10px] font-mono text-gold-500/50 font-bold uppercase tracking-[0.2em]">
                                    {orderNumber}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Estimated Ready Time */}
                {readyTimeStr && (
                    <div className="flex items-center justify-center gap-3 mb-6 md:mb-10 text-slate-300 animate-in slide-in-from-bottom duration-500 delay-500">
                        <Clock size={16} className="md:size-[20px] text-blue-400" />
                        <span className="text-[10px] md:text-sm font-bold">
                            Ready In (~):
                        </span>
                        <span className="text-lg md:text-xl font-black text-blue-400">
                            {readyTimeStr}
                        </span>
                    </div>
                )}

                {/* Instructions */}
                <p className="text-center text-slate-500 text-[10px] md:text-sm mb-6 md:mb-8 leading-relaxed animate-in fade-in duration-500 delay-600">
                    {orderType} order received. <br className="md:hidden" />
                    Inform customer of token <span className="text-gold-500 font-bold">{displayToken}</span>.
                </p>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 md:gap-4 animate-in slide-in-from-bottom duration-500 delay-700">
                    {onPrintToken && (
                        <button
                            onClick={onPrintToken}
                            className="flex-1 h-12 md:h-16 bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 hover:border-slate-600 text-slate-300 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2 md:gap-3 group">
                            <Printer size={16} className="md:size-[20px] group-hover:scale-110 transition-transform" />
                            Print Token
                        </button>
                    )}

                    <button
                        onClick={onNewOrder}
                        className="flex-1 h-12 md:h-16 bg-gradient-to-r from-gold-500 to-yellow-500 hover:from-gold-400 hover:to-yellow-400 text-black rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-gold-500/20 hover:shadow-gold-500/40 hover:scale-[1.02] active:scale-[0.98]">
                        Finish & New
                    </button>
                </div>

                <style>{`
                    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(212, 175, 55, 0.2); border-radius: 10px; }
                `}</style>

            </div>
        </div>
    );
};
