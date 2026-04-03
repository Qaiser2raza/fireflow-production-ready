import React, { useState, useEffect } from 'react';
import { 
    Grid, 
    List, 
    CreditCard, 
    Shield, 
    Smartphone,
    UtensilsCrossed,
    BookOpen
} from 'lucide-react';
import { useIsMobile } from '../client/hooks/useIsMobile';

// Import existing components
import { POSView } from '../operations/pos/POSView';
import { POSViewMobile } from '../operations/pos/POSViewMobile';
import { OrdersView } from '../operations/orders/OrdersView';
import { QRCodePairing as DevicePairing } from '../features/settings/QRCodePairing';
import FBRTab from '../components/cashier/FBRTab';
import DaybookTab from '../components/cashier/DaybookTab';
import { CustomerLedgerPanel } from '../features/settings/config/CustomerLedgerPanel';
import { SupplierLedgerPanel } from '../features/settings/config/SupplierLedgerPanel';
import { KDSView } from '../operations/kds/KDSView';

const CashierView: React.FC = () => {
    const isMobile = useIsMobile();
    const [activeTab, setActiveTab] = useState<'POS' | 'ORDERS' | 'PAYMENTS' | 'KITCHEN' | 'FBR' | 'DAYBOOK' | 'PAIRING'>('POS');

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
        { id: 'KITCHEN', label: 'Kitchen', icon: UtensilsCrossed },
        { id: 'PAYMENTS', label: 'Payments', icon: CreditCard },
        { id: 'DAYBOOK', label: 'Daybook', icon: BookOpen },
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
                return (
                    <div className="flex flex-col h-full bg-[#0f1117] overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
                           <section>
                               <div className="flex items-center gap-3 mb-6 px-2">
                                   <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                                   <h2 className="text-xl font-black text-white uppercase tracking-tighter italic">Debtor Ledger & Receipts</h2>
                               </div>
                               <CustomerLedgerPanel />
                           </section>

                           <div className="h-px bg-white/5 mx-2" />

                           <section className="pb-20">
                               <div className="flex items-center gap-3 mb-6 px-2">
                                   <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
                                   <h2 className="text-xl font-black text-white uppercase tracking-tighter italic">Supplier Balance & Outflow</h2>
                               </div>
                               <SupplierLedgerPanel />
                           </section>
                        </div>
                    </div>
                );
            case 'KITCHEN':
                return <KDSView />;
            case 'DAYBOOK':
                return <DaybookTab />;
            case 'FBR':
                return <FBRTab />;
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

export default CashierView;
