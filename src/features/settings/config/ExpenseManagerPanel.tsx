import React, { useState } from 'react';
import { 
    TrendingDown, 
    Plus,
    Receipt
} from 'lucide-react';

import { fetchWithAuth } from '../../../shared/lib/authInterceptor';
import { useRestaurant } from '../../../client/RestaurantContext';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Input } from '../../../shared/ui/Input';
// Removed react-hot-toast

export const ExpenseManagerPanel: React.FC = () => {
    const { currentRestaurant } = useRestaurant();
    const { addNotification } = useAppContext();
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    
    const [expenseData, setExpenseData] = useState({
        category: 'Utilities',
        amount: '',
        description: '',
        paymentMethod: 'CASH'
    });

    const categories = [
        'Utilities', 
        'Salaries', 
        'Rent', 
        'Maintenance', 
        'Marketing', 
        'Supplies', 
        'Others'
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${baseUrl}/finance/expenses`, {
                method: 'POST',
                body: JSON.stringify({
                    ...expenseData,
                    restaurantId: currentRestaurant?.id,
                    amount: parseFloat(expenseData.amount)
                })
            });

             if (res.ok) {
                addNotification('success', 'Expense recorded successfully');
                setShowModal(false);
                setExpenseData({
                    category: 'Utilities',
                    amount: '',
                    description: '',
                    paymentMethod: 'CASH'
                });
             } else {
                addNotification('error', 'Failed to record expense');
            }
        } catch (e) {
            addNotification('error', 'System error recording expense');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-white">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-6 bg-gradient-to-br from-red-500/10 to-transparent border-red-500/20">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-red-500/20 rounded-xl">
                            <TrendingDown className="w-6 h-6 text-red-500" />
                        </div>
                        <Button 
                            variant="secondary" 
                            size="sm"
                            onClick={() => setShowModal(true)}
                        >
                            Record Expense
                        </Button>
                    </div>
                    <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">General Outflow</h3>
                    <p className="text-2xl font-bold text-white mt-1">Operating Expenses</p>
                </Card>

                <Card className="p-6 bg-slate-900 border-slate-800 flex items-center justify-center border-dashed">
                    <div className="text-center text-slate-500">
                        <Receipt className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-xs">Expense analytics are integrated into Dashboard</p>
                    </div>
                </Card>
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-md p-6 bg-slate-900 border-slate-800 text-white">
                        <div className="flex items-center gap-3 mb-6">
                            <Plus className="w-5 h-5 text-red-400" />
                            <h2 className="text-xl font-bold">New Expense</h2>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="text-sm text-slate-400 mb-1 block">Category</label>
                                <select 
                                    className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
                                    value={expenseData.category}
                                    onChange={(e) => setExpenseData({...expenseData, category: e.target.value})}
                                >
                                    {categories.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-sm text-slate-400 mb-1 block">Amount (Rs.)</label>
                                <Input 
                                    type="number" 
                                    value={expenseData.amount}
                                    onChange={(e) => setExpenseData({...expenseData, amount: e.target.value})}
                                    placeholder="Enter expense amount"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-sm text-slate-400 mb-1 block">Description</label>
                                <Input 
                                    value={expenseData.description}
                                    onChange={(e) => setExpenseData({...expenseData, description: e.target.value})}
                                    placeholder="e.g. Electricity Bill, Staff Salary"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-sm text-slate-400 mb-1 block">Payment Method</label>
                                <select 
                                    className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2"
                                    value={expenseData.paymentMethod}
                                    onChange={(e) => setExpenseData({...expenseData, paymentMethod: e.target.value})}
                                >
                                    <option value="CASH">Cash</option>
                                    <option value="BANK">Bank Transfer</option>
                                    <option value="CARD">Debit/Credit Card</option>
                                </select>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    className="flex-1"
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    type="submit" 
                                    className="flex-1 bg-red-600 hover:bg-red-500"
                                    disabled={loading}
                                >
                                    {loading ? 'Processing...' : 'Record Expense'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
};
