import React, { useState } from 'react';
import { ChevronDown, ChevronUp, User, Phone } from 'lucide-react';

interface CustomerQuickAddProps {
    customerPhone: string;
    customerName: string;
    onPhoneChange: (phone: string) => void;
    onNameChange: (name: string) => void;
    isLoading?: boolean;
    matchedCustomers?: Array<{ id: string; name?: string; phone: string }>;
    onSelectCustomer?: (customer: { phone: string; name?: string }) => void;
}

export const CustomerQuickAdd: React.FC<CustomerQuickAddProps> = ({
    customerPhone,
    customerName,
    onPhoneChange,
    onNameChange,
    isLoading,
    matchedCustomers,
    onSelectCustomer
}) => {
    const [isExpanded, setIsExpanded] = useState(true); // Start expanded for better UX
    const [showDropdown, setShowDropdown] = useState(false);

    const handlePhoneInput = (value: string) => {
        onPhoneChange(value);
        if (value.length >= 4) {
            setShowDropdown(true);
        } else {
            setShowDropdown(false);
        }
    };

    const selectCustomer = (customer: any) => {
        if (onSelectCustomer) {
            onSelectCustomer(customer);
        }
        setShowDropdown(false);
    };

    return (
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl overflow-hidden transition-all">
            {/* Collapsible Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors text-left">
                <div className="flex items-center gap-3">
                    <User size={18} className="text-slate-500" />
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                        Customer Details (Optional)
                    </span>
                </div>
                {isExpanded ? (
                    <ChevronUp size={20} className="text-slate-500" />
                ) : (
                    <ChevronDown size={20} className="text-slate-500" />
                )}
            </button>

            {/* Expandable Content */}
            {isExpanded && (
                <div className="p-4 pt-0 space-y-4 animate-in slide-in-from-top duration-300">

                    {/* Phone Input with Autocomplete */}
                    <div className="relative">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                            Phone Number
                        </label>
                        <div className="relative">
                            <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
                            <input
                                type="tel"
                                placeholder="03XX-XXXXXXX"
                                value={customerPhone}
                                onChange={(e) => handlePhoneInput(e.target.value)}
                                className="w-full h-12 bg-slate-950/50 border border-slate-800 rounded-xl pl-12 pr-4 text-slate-200 text-sm font-bold placeholder:text-slate-700 focus:outline-none focus:border-blue-500 transition-colors">
                            </input>
                            {isLoading && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>

                        {/* Customer Dropdown */}
                        {showDropdown && matchedCustomers && matchedCustomers.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto">
                                <div className="p-2 space-y-1">
                                    {matchedCustomers.slice(0, 5).map((customer) => (
                                        <button
                                            key={customer.id}
                                            onClick={() => selectCustomer(customer)}
                                            className="w-full p-3 flex items-center justify-between hover:bg-slate-800 rounded-lg transition-colors text-left">
                                            <div>
                                                <div className="text-sm font-bold text-white">
                                                    {customer.name || 'Unnamed Customer'}
                                                </div>
                                                <div className="text-xs text-slate-400">
                                                    {customer.phone}
                                                </div>
                                            </div>
                                            <ChevronDown size={16} className="text-slate-600 rotate-[-90deg]" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Name Input */}
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                            Customer Name
                        </label>
                        <div className="relative">
                            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
                            <input
                                type="text"
                                placeholder="Enter customer name"
                                value={customerName}
                                onChange={(e) => onNameChange(e.target.value)}
                                className="w-full h-12 bg-slate-950/50 border border-slate-800 rounded-xl pl-12 pr-4 text-slate-200 text-sm font-bold placeholder:text-slate-700 focus:outline-none focus:border-blue-500 transition-colors">
                            </input>
                        </div>
                    </div>

                    {/* Helper Text */}
                    <p className="text-[10px] text-slate-600 italic">
                        💡 Adding customer details helps build your loyalty database for future orders
                    </p>

                </div>
            )}
        </div>
    );
};
