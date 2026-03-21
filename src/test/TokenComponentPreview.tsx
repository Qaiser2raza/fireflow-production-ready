/**
 * Token Component Preview
 * Standalone test page to preview TokenDisplayBanner and CustomerQuickAdd components
 * 
 * To test: Add this to your router or create a test route
 */

import React, { useState } from 'react';
import { TokenDisplayBanner } from '../operations/pos/components/TokenDisplayBanner';
import { CustomerQuickAdd } from '../operations/pos/components/CustomerQuickAdd';

export const TokenComponentPreview: React.FC = () => {
    const [showBanner, setShowBanner] = useState(false);
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerName, setCustomerName] = useState('');

    const mockCustomers = [
        { id: '1', name: 'Ali Hassan', phone: '0311-1234567' },
        { id: '2', name: 'Sara Khan', phone: '0321-9876543' },
        { id: '3', name: 'Ahmed Ali', phone: '0333-5555555' }
    ];

    const matchedCustomers = mockCustomers.filter(c =>
        customerPhone && c.phone.includes(customerPhone)
    );

    const estimatedTime = new Date();
    estimatedTime.setMinutes(estimatedTime.getMinutes() + 15);

    return (
        <div className="min-h-screen bg-slate-950 p-8">
            <div className="max-w-4xl mx-auto space-y-8">

                {/* Header */}
                <div className="text-center">
                    <h1 className="text-4xl font-black text-white mb-2">
                        Token Component Preview
                    </h1>
                    <p className="text-slate-400">
                        Testing TokenDisplayBanner and CustomerQuickAdd components
                    </p>
                </div>

                {/* Test Controls */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">

                    <div>
                        <h2 className="text-xl font-black text-gold-500 mb-4">
                            1️⃣ Token Display Banner Test
                        </h2>
                        <button
                            onClick={() => setShowBanner(true)}
                            className="w-full py-4 bg-gradient-to-r from-gold-500 to-yellow-500 hover:from-gold-400 hover:to-yellow-400 text-black rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-xl shadow-gold-500/20">
                            Show Token Banner (T042)
                        </button>
                        <p className="text-xs text-slate-500 mt-2">
                            Click to display the token banner as it would appear after creating a takeaway order
                        </p>
                    </div>

                    <div className="h-px bg-slate-800"></div>

                    <div>
                        <h2 className="text-xl font-black text-gold-500 mb-4">
                            2️⃣ Customer Quick Add Test
                        </h2>
                        <CustomerQuickAdd
                            customerPhone={customerPhone}
                            customerName={customerName}
                            onPhoneChange={setCustomerPhone}
                            onNameChange={setCustomerName}
                            isLoading={false}
                            matchedCustomers={matchedCustomers}
                            onSelectCustomer={(customer) => {
                                setCustomerPhone(customer.phone);
                                setCustomerName(customer.name || '');
                            }}
                        />
                        <div className="mt-4 p-4 bg-slate-950 border border-slate-800 rounded-xl">
                            <p className="text-xs text-slate-400 mb-2">Current Values:</p>
                            <pre className="text-xs text-green-400 font-mono">
                                {JSON.stringify({ phone: customerPhone, name: customerName }, null, 2)}
                            </pre>
                        </div>
                    </div>

                </div>

                {/* Test Results */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <h2 className="text-xl font-black text-blue-400 mb-4">
                        ✅ Component Test Checklist
                    </h2>
                    <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded border-2 border-green-500 flex items-center justify-center text-green-500 text-xs">
                                ✓
                            </div>
                            <span className="text-slate-300">TokenDisplayBanner displays large token number</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded border-2 border-green-500 flex items-center justify-center text-green-500 text-xs">
                                ✓
                            </div>
                            <span className="text-slate-300">Estimated ready time shows correctly</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded border-2 border-green-500 flex items-center justify-center text-green-500 text-xs">
                                ✓
                            </div>
                            <span className="text-slate-300">CustomerQuickAdd is collapsible</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded border-2 border-green-500 flex items-center justify-center text-green-500 text-xs">
                                ✓
                            </div>
                            <span className="text-slate-300">Phone autocomplete dropdown appears</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded border-2 border-green-500 flex items-center justify-center text-green-500 text-xs">
                                ✓
                            </div>
                            <span className="text-slate-300">Customer selection fills name automatically</span>
                        </div>
                    </div>
                </div>

                {/* Usage Notes */}
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-6">
                    <h3 className="text-lg font-black text-blue-400 mb-3">
                        📘 Usage Notes
                    </h3>
                    <ul className="space-y-2 text-sm text-slate-300">
                        <li>• <strong>Token Banner:</strong> Auto-displays after takeaway order is fired to kitchen</li>
                        <li>• <strong>Customer Fields:</strong> Completely optional - collapsed by default for speed</li>
                        <li>• <strong>Phone Autocomplete:</strong> Start typing to see matching customers</li>
                        <li>• <strong>Token Format:</strong> T### with daily reset (T001-T999)</li>
                        <li>• <strong>Pickup Time:</strong> Auto-calculated: 10min base + 2min per item (max 30min)</li>
                    </ul>
                </div>

            </div>

            {/* Token Banner Modal */}
            {showBanner && (
                <TokenDisplayBanner
                    token="T042"
                    estimatedReadyTime={estimatedTime}
                    onPrintToken={() => {
                        alert('Print token functionality - connects to thermal printer');
                    }}
                    onNewOrder={() => {
                        setShowBanner(false);
                        alert('Token banner closed - ready for next order');
                    }}
                />
            )}
        </div>
    );
};
