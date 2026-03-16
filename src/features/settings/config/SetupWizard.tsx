
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../../client/contexts/AppContext';
import { 
  Building2, MapPin, Calculator, Receipt, Printer, 
  CheckCircle2, ArrowRight, ArrowLeft, Loader2, Wand2,
  ShieldCheck, Laptop
} from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

const API_BASE_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

interface SetupWizardProps {
    onComplete: () => void;
    onClose: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete, onClose }) => {
    const { currentUser, currentRestaurant, addNotification } = useAppContext();
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [config, setConfig] = useState<any>({});
    const [systemPrinters, setSystemPrinters] = useState<any[]>([]);

    const restaurantId = currentUser?.restaurant_id;

    useEffect(() => {
        const loadInitialData = async () => {
            if (!restaurantId) return;
            setIsLoading(true);
            try {
                // Fetch existing config
                const res = await fetchWithAuth(`${API_BASE_URL}/operations/config/${restaurantId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) setConfig(data.config);
                }

                // Fetch system printers via Electron IPC
                if ((window as any).electron?.ipcRenderer) {
                    const printers = await (window as any).electron.ipcRenderer.invoke('get-printers');
                    setSystemPrinters(printers || []);
                }
            } catch (err) {
                console.error('Setup Wizard init error:', err);
            } finally {
                setIsLoading(false);
            }
        };
        loadInitialData();
    }, [restaurantId]);

    const handleNext = () => setStep(s => Math.min(6, s + 1));
    const handleBack = () => setStep(s => Math.max(1, s - 1));

    const handleFinish = async () => {
        if (!restaurantId) return;
        setIsSaving(true);
        try {
            const finalConfig = { ...config, setup_wizard_completed: true };
            const res = await fetchWithAuth(`${API_BASE_URL}/operations/config/${restaurantId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalConfig)
            });

            if (!res.ok) throw new Error('Failed to save final configuration');
            
            addNotification('success', 'FireFlow Setup Completed! Welcome aboard.');
            onComplete();
        } catch (err: any) {
            addNotification('error', err.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col items-center justify-center">
                <Wand2 size={48} className="text-gold-500 animate-pulse mb-4" />
                <h2 className="text-white font-black uppercase tracking-widest text-sm">Preparing Setup Wizard...</h2>
            </div>
        );
    }

    const inputClass = "w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-gold-500 outline-none transition-all";
    const labelClass = "text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 ml-1";

    const steps = [
        { id: 1, title: 'Identity', icon: Building2 },
        { id: 2, title: 'Location', icon: MapPin },
        { id: 3, title: 'Billing', icon: Calculator },
        { id: 4, title: 'Receipt', icon: Receipt },
        { id: 5, title: 'Hardware', icon: Printer },
        { id: 6, title: 'Finish', icon: CheckCircle2 },
    ];

    return (
        <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col font-sans overflow-hidden">
            {/* Header / Progress */}
            <div className="flex-shrink-0 border-b border-slate-800 bg-slate-900/50 px-8 py-6">
                <div className="flex items-center justify-between max-w-5xl mx-auto">
                    <div className="flex items-center gap-4">
                        <div className="size-12 bg-gold-500 rounded-2xl flex items-center justify-center text-black shadow-lg shadow-gold-500/20">
                            <Wand2 size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-white uppercase tracking-tighter">Initial Setup</h1>
                            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Configuring FireFlow for {currentRestaurant?.name}</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {steps.map(s => (
                            <div key={s.id} className="flex items-center">
                                <div className={`size-8 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                                    step === s.id ? 'bg-gold-500 text-black scale-110 shadow-lg shadow-gold-500/20' : 
                                    step > s.id ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500'
                                }`}>
                                    {step > s.id ? <CheckCircle2 size={16} /> : s.id}
                                </div>
                                {s.id < 6 && <div className={`w-8 h-px ${step > s.id ? 'bg-emerald-500' : 'bg-slate-800'}`} />}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                <div className="max-w-2xl mx-auto">
                    {step === 1 && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center gap-3 mb-8">
                                <Building2 size={32} className="text-gold-500" />
                                <div>
                                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Business Identity</h2>
                                    <p className="text-slate-500 text-xs">Let's start with your brand basics</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className={labelClass}>Business Name</label>
                                    <input 
                                        value={config.business_name || ''} 
                                        onChange={e => setConfig({...config, business_name: e.target.value})}
                                        className={inputClass} 
                                        placeholder="e.g. Moonlight Grill"
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Urdu Name (Display on Receipt)</label>
                                    <input 
                                        value={config.business_name_urdu || ''} 
                                        onChange={e => setConfig({...config, business_name_urdu: e.target.value})}
                                        className={inputClass + " font-urdu text-base"} 
                                        placeholder="نام لکھیں"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className={labelClass}>Business Type</label>
                                    <select 
                                        value={config.business_type || 'restaurant'} 
                                        onChange={e => setConfig({...config, business_type: e.target.value})}
                                        className={inputClass}
                                    >
                                        <option value="restaurant">Restaurant</option>
                                        <option value="cafe">Café</option>
                                        <option value="bakery">Bakery</option>
                                        <option value="takeaway">Takeaway</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Base Currency</label>
                                    <select 
                                        value={config.currency || 'PKR'} 
                                        onChange={e => setConfig({...config, currency: e.target.value})}
                                        className={inputClass}
                                    >
                                        <option value="PKR">PKR - Pakistani Rupee</option>
                                        <option value="USD">USD - US Dollar</option>
                                        <option value="AED">AED - UAE Dirham</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                             <div className="flex items-center gap-3 mb-8">
                                <MapPin size={32} className="text-gold-500" />
                                <div>
                                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Location & Registration</h2>
                                    <p className="text-slate-500 text-xs">Essential data for tax compliance and delivery</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className={labelClass}>Physical Address</label>
                                    <input 
                                        value={config.business_address || ''} 
                                        onChange={e => setConfig({...config, business_address: e.target.value})}
                                        className={inputClass} 
                                        placeholder="Shop #, Street, Block..."
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>City</label>
                                        <input 
                                            value={config.business_city || ''} 
                                            onChange={e => setConfig({...config, business_city: e.target.value})}
                                            className={inputClass} 
                                            placeholder="Lahore"
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Area</label>
                                        <input 
                                            value={config.business_area || ''} 
                                            onChange={e => setConfig({...config, business_area: e.target.value})}
                                            className={inputClass} 
                                            placeholder="Gulberg III"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>NTN Number</label>
                                        <input 
                                            value={config.ntn_number || ''} 
                                            onChange={e => setConfig({...config, ntn_number: e.target.value})}
                                            className={inputClass} 
                                            placeholder="1234567-8"
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>STRN Number</label>
                                        <input 
                                            value={config.strn_number || ''} 
                                            onChange={e => setConfig({...config, strn_number: e.target.value})}
                                            className={inputClass} 
                                            placeholder="12-34-..."
                                        />
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <ShieldCheck className="text-gold-500" />
                                        <div>
                                            <span className="text-sm font-bold text-white block">FBR / Tax Registered</span>
                                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Enable automated sales tax reporting</span>
                                        </div>
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        checked={config.is_fbr_registered || false}
                                        onChange={e => setConfig({...config, is_fbr_registered: e.target.checked})}
                                        className="size-6 accent-gold-500 cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                            <div className="flex items-center gap-3 mb-8">
                                <Calculator size={32} className="text-gold-500" />
                                <div>
                                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Billing Rules</h2>
                                    <p className="text-slate-500 text-xs">Configure how you charge your customers</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-4">
                                     <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl">
                                        <span className="text-sm font-bold text-white">Apply Sales Tax</span>
                                        <input 
                                            type="checkbox" 
                                            checked={config.taxEnabled || false}
                                            onChange={e => setConfig({...config, taxEnabled: e.target.checked})}
                                            className="size-5 accent-gold-500"
                                        />
                                    </div>
                                    {config.taxEnabled && (
                                        <div>
                                            <label className={labelClass}>Tax Rate (%)</label>
                                            <input 
                                                type="number"
                                                value={config.taxRate || 0} 
                                                onChange={e => setConfig({...config, taxRate: Number(e.target.value)})}
                                                className={inputClass} 
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-4">
                                     <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl">
                                        <span className="text-sm font-bold text-white">Service Charge</span>
                                        <input 
                                            type="checkbox" 
                                            checked={config.serviceChargeEnabled || false}
                                            onChange={e => setConfig({...config, serviceChargeEnabled: e.target.checked})}
                                            className="size-5 accent-gold-500"
                                        />
                                    </div>
                                    {config.serviceChargeEnabled && (
                                        <div>
                                            <label className={labelClass}>Charge Rate (%)</label>
                                            <input 
                                                type="number"
                                                value={config.serviceChargeRate || 0} 
                                                onChange={e => setConfig({...config, serviceChargeRate: Number(e.target.value)})}
                                                className={inputClass} 
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 pt-4">
                                <div>
                                    <label className={labelClass}>Default Delivery Fee</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-3.5 text-slate-500 text-xs font-bold">{config.currency || 'PKR'}</span>
                                        <input 
                                            type="number"
                                            value={config.defaultDeliveryFee || 0} 
                                            onChange={e => setConfig({...config, defaultDeliveryFee: Number(e.target.value)})}
                                            className={inputClass + " pl-12"} 
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelClass}>Max Allowed Discount (%)</label>
                                    <input 
                                        type="number"
                                        value={config.maxDiscountRate || 100} 
                                        onChange={e => setConfig({...config, maxDiscountRate: Number(e.target.value)})}
                                        className={inputClass} 
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                             <div className="flex items-center gap-3 mb-8">
                                <Receipt size={32} className="text-gold-500" />
                                <div>
                                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Receipt Presentation</h2>
                                    <p className="text-slate-500 text-xs">How customers see their bills</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className={labelClass}>Header Line 1</label>
                                    <input 
                                        value={config.receipt_header_1 || ''} 
                                        onChange={e => setConfig({...config, receipt_header_1: e.target.value})}
                                        className={inputClass} 
                                        placeholder="e.g. MOONLIGHT GRILL"
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Tax Label on Receipt</label>
                                    <select 
                                        value={config.tax_label || 'GST'} 
                                        onChange={e => setConfig({...config, tax_label: e.target.value})}
                                        className={inputClass}
                                    >
                                        <option value="GST">GST</option>
                                        <option value="VAT">VAT</option>
                                        <option value="Sales Tax">Sales Tax</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
                                        <span className="text-sm font-bold text-white">Auto-Print</span>
                                        <input 
                                            type="checkbox" 
                                            checked={config.auto_print_receipt ?? true}
                                            onChange={e => setConfig({...config, auto_print_receipt: e.target.checked})}
                                            className="size-5 accent-gold-500"
                                        />
                                    </div>
                                    <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
                                        <span className="text-sm font-bold text-white">Show Dialog</span>
                                        <input 
                                            type="checkbox" 
                                            checked={config.show_print_dialog ?? false}
                                            onChange={e => setConfig({...config, show_print_dialog: e.target.checked})}
                                            className="size-5 accent-gold-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                            <div className="flex items-center gap-3 mb-8">
                                <Printer size={32} className="text-gold-500" />
                                <div>
                                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Device Setup</h2>
                                    <p className="text-slate-500 text-xs">Connecting your thermal printers</p>
                                </div>
                            </div>

                            <div className="p-8 bg-slate-900 rounded-3xl border border-slate-800 text-center border-dashed">
                                <Laptop size={48} className="text-slate-700 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-white mb-2">Detected System Printers</h3>
                                <p className="text-slate-500 text-xs mb-6 px-12">FireFlow has identified {systemPrinters.length} local printers. Connect your thermal hardware below.</p>
                                
                                <div className="space-y-2 max-w-sm mx-auto">
                                    {systemPrinters.length > 0 ? (
                                        systemPrinters.map(p => (
                                            <div key={p.name} className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                                                <div className="flex items-center gap-2">
                                                    <div className="size-2 rounded-full bg-emerald-500" />
                                                    <span className="text-xs font-bold text-white truncate max-w-[150px]">{p.name}</span>
                                                </div>
                                                <button 
                                                    onClick={() => addNotification('info', `Printer ${p.name} set as primary`)}
                                                    className="text-[10px] font-black uppercase text-gold-500"
                                                >
                                                    Set Default
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-red-500 text-[10px] font-black uppercase">No printers detected on this system</p>
                                    )}
                                </div>
                                
                                <button 
                                    className="mt-8 text-xs font-bold text-slate-400 hover:text-white underline"
                                    onClick={() => window.location.reload()}
                                >
                                    Rescan Devices
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 6 && (
                        <div className="space-y-6 text-center py-12 animate-in zoom-in duration-500">
                            <div className="size-48 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-emerald-500/20">
                                <CheckCircle2 size={96} className="text-emerald-500" />
                            </div>
                            <h2 className="text-5xl font-black text-white uppercase tracking-tighter">You're Ready!</h2>
                            <p className="text-slate-500 max-w-md mx-auto">
                                All baseline configurations are complete. You can now start taking orders and managing your floor plan.
                            </p>
                            
                            <div className="pt-12 grid grid-cols-3 gap-4 text-left max-w-lg mx-auto">
                                <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-2xl">
                                    <div className="text-gold-500 font-black text-xs mb-1">CURRENCY</div>
                                    <div className="text-white font-bold text-sm tracking-tighter">{config.currency || 'PKR'}</div>
                                </div>
                                <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-2xl">
                                    <div className="text-gold-500 font-black text-xs mb-1">TAX REG</div>
                                    <div className="text-white font-bold text-sm tracking-tighter">{config.is_fbr_registered ? 'ACTIVE' : 'NONE'}</div>
                                </div>
                                <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-2xl">
                                    <div className="text-gold-500 font-black text-xs mb-1">AUTO-PRINT</div>
                                    <div className="text-white font-bold text-sm tracking-tighter">{config.auto_print_receipt ? 'ON' : 'OFF'}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer / Controls */}
            <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900/30 px-8 py-6">
                <div className="flex items-center justify-between max-w-5xl mx-auto">
                    <button 
                        onClick={step === 1 ? onClose : handleBack}
                        className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-xs font-black uppercase tracking-widest"
                    >
                        {step === 1 ? 'Cancel Setup' : <><ArrowLeft size={16} /> Previous</>}
                    </button>
                    
                    <button 
                        disabled={isSaving}
                        onClick={step === 6 ? handleFinish : handleNext}
                        className="bg-gold-500 hover:bg-gold-400 text-black px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-xl shadow-gold-500/20 hover:scale-105 active:scale-95 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : step === 6 ? 'Start Using FireFlow' : <>Next Step <ArrowRight size={16} /></>}
                    </button>
                </div>
            </div>
        </div>
    );
};
