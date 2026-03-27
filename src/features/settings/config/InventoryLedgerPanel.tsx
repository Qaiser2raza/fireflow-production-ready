import React, { useState, useEffect } from 'react';
import { 
    Plus, 
    Calculator
} from 'lucide-react';
import { apiClient as api } from '../../../shared/lib/apiClient';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';
import { useRestaurant } from '../../../client/RestaurantContext';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Input } from '../../../shared/ui/Input';
// Removed react-hot-toast

export const InventoryLedgerPanel: React.FC = () => {
    const { currentRestaurant } = useRestaurant();
    const { addNotification } = useAppContext();
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [showPurchaseModal, setShowPurchaseModal] = useState(false);
    const [showClosingModal, setShowClosingModal] = useState(false);
    
    // Form States
    const [purchaseData, setPurchaseData] = useState({
        supplierId: '',
        amount: '',
        isCredit: false,
        description: ''
    });
    const [closingData, setClosingData] = useState({
        amount: ''
    });

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${baseUrl}/suppliers`);
            if (res.ok) {
                const data = await res.json();
                setSuppliers(data || []);
            }
        } catch (e) {
            console.error('Failed to fetch suppliers');
        }
    };

    const handlePurchase = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            // api is for POST/PATCH/DELETE
            await api.from('inventory_purchases').insert({
                ...purchaseData,
                restaurantId: currentRestaurant?.id,
                amount: parseFloat(purchaseData.amount)
            }).execute();
            
            // Note: Since api.from().insert() is a custom wrapper, we check the actual backend logic
            // For periodic inventory, we're using the /api/finance/inventory/purchase endpoint instead
            const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${baseUrl}/finance/inventory/purchase`, {
                method: 'POST',
                body: JSON.stringify({
                    ...purchaseData,
                    restaurantId: currentRestaurant?.id,
                    amount: parseFloat(purchaseData.amount)
                })
            });

            if (res.ok) {
                addNotification('success', 'Purchase recorded successfully');
                setShowPurchaseModal(false);
                setPurchaseData({ supplierId: '', amount: '', isCredit: false, description: '' });
            }
        } catch (e) {
            addNotification('error', 'Failed to record purchase');
        } finally {
            setLoading(false);
        }
    };

    const handleClosing = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${baseUrl}/finance/inventory/closing`, {
                method: 'POST',
                body: JSON.stringify({
                    restaurantId: currentRestaurant?.id,
                    closingAmount: parseFloat(closingData.amount)
                })
            });

            if (res.ok) {
                addNotification('success', 'Inventory closing recorded');
                setShowClosingModal(false);
                setClosingData({ amount: '' });
            }
        } catch (e) {
            addNotification('error', 'Failed to record closing');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header / Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-blue-500/20 rounded-xl">
                            <Plus className="w-6 h-6 text-blue-400" />
                        </div>
                        <Button 
                            variant="secondary" 
                            size="sm"
                            onClick={() => setShowPurchaseModal(true)}
                        >
                            Record Purchase
                        </Button>
                    </div>
                    <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Inventory Inflow</h3>
                    <p className="text-2xl font-bold text-white mt-1">Stock Purchase</p>
                </Card>

                <Card className="p-6 bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-emerald-500/20 rounded-xl">
                            <Calculator className="w-6 h-6 text-emerald-400" />
                        </div>
                        <Button 
                            variant="secondary" 
                            size="sm"
                            onClick={() => setShowClosingModal(true)}
                        >
                            End Period
                        </Button>
                    </div>
                    <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Closing Stock</h3>
                    <p className="text-2xl font-bold text-white mt-1">Manual Count</p>
                </Card>
            </div>

            {/* Modal: Record Purchase */}
            {showPurchaseModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-white">
                    <Card className="w-full max-w-md p-6 bg-slate-900 border-slate-800">
                        <div className="flex items-center gap-3 mb-6">
                            <Plus className="w-5 h-5 text-blue-400" />
                            <h2 className="text-xl font-bold">Record Purchase</h2>
                        </div>
                        
                        <form onSubmit={handlePurchase} className="space-y-4">
                            <div>
                                <label className="text-sm text-slate-400 mb-1 block">Supplier</label>
                                <select 
                                    className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
                                    value={purchaseData.supplierId}
                                    onChange={(e) => setPurchaseData({...purchaseData, supplierId: e.target.value})}
                                    required
                                >
                                    <option value="">Select Supplier</option>
                                    {suppliers.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-sm text-slate-400 mb-1 block">Amount (Rs.)</label>
                                <Input 
                                    type="number" 
                                    value={purchaseData.amount}
                                    onChange={(e) => setPurchaseData({...purchaseData, amount: e.target.value})}
                                    placeholder="Enter total bill amount"
                                    required
                                />
                            </div>

                            <div className="flex items-center gap-2 py-2">
                                <input 
                                    type="checkbox" 
                                    id="isCredit"
                                    checked={purchaseData.isCredit}
                                    onChange={(e) => setPurchaseData({...purchaseData, isCredit: e.target.checked})}
                                    className="w-4 h-4 rounded border-slate-700 bg-slate-800"
                                />
                                <label htmlFor="isCredit" className="text-sm">Credit Purchase (Add to Ledger)</label>
                            </div>

                            <div>
                                <label className="text-sm text-slate-400 mb-1 block">Description</label>
                                <Input 
                                    value={purchaseData.description}
                                    onChange={(e) => setPurchaseData({...purchaseData, description: e.target.value})}
                                    placeholder="e.g. Weekly Vegetables, Meat Supply"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    className="flex-1"
                                    onClick={() => setShowPurchaseModal(false)}
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    type="submit" 
                                    className="flex-1 bg-blue-600 hover:bg-blue-500"
                                    disabled={loading}
                                >
                                    {loading ? 'Processing...' : 'Record Bill'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {/* Modal: Closing Stock */}
            {showClosingModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-white">
                    <Card className="w-full max-w-md p-6 bg-slate-900 border-slate-800">
                        <div className="flex items-center gap-3 mb-6">
                            <Calculator className="w-5 h-5 text-emerald-400" />
                            <h2 className="text-xl font-bold">Inventory Closing</h2>
                        </div>
                        
                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg mb-6">
                            <p className="text-xs text-emerald-400 leading-relaxed">
                                Enter the total value of stock currently physically present. 
                                The system will automatically calculate COGS as: <br/>
                                <strong>Opening Balance + Purchases - Closing Stock</strong>
                            </p>
                        </div>

                        <form onSubmit={handleClosing} className="space-y-4">
                            <div>
                                <label className="text-sm text-slate-400 mb-1 block">Physical Stock Value (Rs.)</label>
                                <Input 
                                    type="number" 
                                    value={closingData.amount}
                                    onChange={(e) => setClosingData({...closingData, amount: e.target.value})}
                                    placeholder="e.g. 50000"
                                    required
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    className="flex-1"
                                    onClick={() => setShowClosingModal(false)}
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    type="submit" 
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                                    disabled={loading}
                                >
                                    {loading ? 'Processing...' : 'Save & Adjust'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
};
