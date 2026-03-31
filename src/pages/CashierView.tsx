import React, { useState, useEffect } from 'react';
import { 
    Grid, 
    List, 
    CreditCard, 
    Shield, 
    Smartphone, 
    Zap,
    Clock,
    User
} from 'lucide-react';
import { useAppContext as useApp } from '../client/contexts/AppContext';
import { useIsMobile } from '../client/hooks/useIsMobile';

// Import existing components
import { POSView } from '../operations/pos/POSView';
import { POSViewMobile } from '../operations/pos/POSViewMobile';
import { OrdersView } from '../operations/orders/OrdersView';
import { QRCodePairing as DevicePairing } from '../features/settings/QRCodePairing';

const CashierView: React.FC = () => {
    const { currentUser } = useApp();
    const isMobile = useIsMobile();
    const [activeTab, setActiveTab] = useState<'POS' | 'ORDERS' | 'PAYMENTS' | 'FBR' | 'PAIRING'>('POS');

    // Inject Google Fonts
    useEffect(() => {
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=IBM+Plex+Mono:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        return () => {
            document.head.removeChild(link);
        };
    }, []);

    const tabs = [
        { id: 'POS', label: 'POS', icon: Grid },
        { id: 'ORDERS', label: 'Orders', icon: List },
        { id: 'PAYMENTS', label: 'Payments', icon: CreditCard },
        { id: 'FBR', label: 'FBR', icon: Shield },
        { id: 'PAIRING', label: 'Pair', icon: Smartphone },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'POS':
                return isMobile ? <POSViewMobile /> : <POSView />;
            case 'ORDERS':
                return <OrdersView />;
            case 'PAYMENTS':
                return <PaymentsPlaceholder />;
            case 'FBR':
                return <FBRPlaceholder />;
            case 'PAIRING':
                return (
                    <div className="p-4 h-full bg-[#0f1117]">
                        <div className="bg-[#1a1d27] border border-slate-800 rounded-2xl overflow-hidden h-full">
                            <DevicePairing />
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-[#0f1117] text-slate-200 flex flex-col font-['DM_Sans'] select-none">
            {/* Content Area */}
            <main className="flex-1 overflow-hidden relative">
                <div className="absolute inset-0 overflow-y-auto custom-scrollbar">
                    {renderContent()}
                </div>
            </main>

            {/* Bottom Navigation Bar */}
            <nav className="h-20 bg-[#1a1d27] border-t border-slate-800/50 flex items-center justify-around px-2 pb-safe shrink-0 z-50">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className="relative flex flex-col items-center justify-center py-2 px-4 transition-all duration-300"
                        >
                            <Icon 
                                size={22} 
                                className={`transition-all duration-300 ${isActive ? 'text-[#f97316] scale-110' : 'text-slate-500'}`}
                                fill={isActive ? '#f97316' : 'none'}
                                fillOpacity={isActive ? 0.2 : 0}
                            />
                            <span 
                                className={`text-[10px] mt-1 font-['IBM_Plex_Mono'] font-bold uppercase tracking-widest transition-all duration-300 ${
                                    isActive ? 'text-[#f97316]' : 'text-slate-500'
                                }`}
                            >
                                {tab.label}
                            </span>
                            
                            {/* Active Indicator Underline */}
                            {isActive && (
                                <div className="absolute -bottom-1 w-8 h-1 bg-[#f97316] rounded-full shadow-[0_0_10px_rgba(249,115,22,0.5)] animate-pulse" />
                            )}
                        </button>
                    );
                })}
            </nav>

            <style dangerouslySetInnerHTML={{ __html: `
                .pb-safe {
                    padding-bottom: env(safe-area-inset-bottom);
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #1a1d27;
                    border-radius: 10px;
                }
                * {
                    -webkit-tap-highlight-color: transparent;
                }
            `}} />
        </div>
    );
};

// --- Sub-components (Placeholders) ---

const PaymentsPlaceholder: React.FC = () => (
    <div className="p-8 h-full bg-[#0f1117] flex flex-col items-center justify-center space-y-6">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-[2.5rem] flex items-center justify-center border border-emerald-500/20 shadow-2xl shadow-emerald-500/5">
            <CreditCard size={40} className="text-emerald-400" />
        </div>
        <div className="text-center">
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Payments Hub</h2>
            <p className="text-slate-500 font-['IBM_Plex_Mono'] text-xs uppercase tracking-widest max-w-xs">
                Settle Debtor Receipts and Record Supplier Outflow
            </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
            {[
                { title: 'Debtor Receipt', desc: 'Settle outstanding customer khata', icon: User, color: 'indigo' },
                { title: 'Supplier Payment', desc: 'Record cash payment to vendor', icon: Zap, color: 'orange' }
            ].map((card, i) => (
                <div key={i} className="bg-[#1a1d27] border border-slate-800 p-6 rounded-[2rem] hover:border-[#f97316]/50 transition-all cursor-pointer group">
                    <card.icon size={24} className={`text-${card.color}-400 mb-4 group-hover:scale-110 transition-transform`} />
                    <h3 className="text-sm font-black text-white uppercase mb-1">{card.title}</h3>
                    <p className="text-[10px] text-slate-500 font-bold leading-relaxed">{card.desc}</p>
                </div>
            ))}
        </div>
    </div>
);

const FBRPlaceholder: React.FC = () => (
    <div className="p-8 h-full bg-[#0f1117] flex flex-col items-center justify-center space-y-6">
        <div className="w-20 h-20 bg-orange-500/10 rounded-[2.5rem] flex items-center justify-center border border-orange-500/20 shadow-2xl shadow-orange-500/5">
            <Shield size={40} className="text-[#f97316]" />
        </div>
        <div className="text-center">
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">FBR Review</h2>
            <p className="text-slate-500 font-['IBM_Plex_Mono'] text-xs uppercase tracking-widest max-w-xs">
                Synchronization Queue and Compliance Dashboard
            </p>
        </div>
        <div className="bg-[#1a1d27] border border-slate-800 p-8 rounded-[2rem] w-full max-w-md text-center">
            <Clock size={32} className="text-slate-700 mx-auto mb-4" />
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest leading-loose">
                Sync Engine Offline<br/>
                Pending Integration with Sync Tab logic
            </p>
        </div>
    </div>
);

export default CashierView;
