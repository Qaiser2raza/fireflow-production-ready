import React from 'react';
import { MenuItem, MenuItemVariant } from '../../../shared/types';
import { X, Check } from 'lucide-react';

interface VariantSelectionModalProps {
    item: MenuItem;
    onSelect: (variant: MenuItemVariant) => void;
    onClose: () => void;
}

export const VariantSelectionModal: React.FC<VariantSelectionModalProps> = ({
    item,
    onSelect,
    onClose,
}) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                className="bg-[#0B1120] w-full max-w-md rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-gold-500/10 to-transparent">
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">{item.name}</h2>
                        <p className="text-slate-400 text-sm font-medium mt-1">Select Portion / Variant</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Variants List */}
                <div className="p-6 flex flex-col gap-3">
                    {item.variant?.map((variant) => (
                        <button
                            key={variant.id}
                            onClick={() => onSelect(variant)}
                            className="group flex items-center justify-between p-4 bg-slate-900/50 hover:bg-gold-500/10 border border-white/5 hover:border-gold-500/40 rounded-2xl transition-all duration-300 active:scale-[0.98]"
                        >
                            <div className="flex flex-col items-start gap-1">
                                <span className="text-white font-bold text-lg group-hover:text-gold-500 transition-colors">
                                    {variant.name}
                                </span>
                                {variant.name_urdu && (
                                    <span className="font-urdu text-xl text-slate-400 group-hover:text-gold-200/60 leading-none">
                                        {variant.name_urdu}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-gold-500 font-mono font-black text-lg">
                                    Rs. {Number(variant.price).toLocaleString()}
                                </span>
                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-gold-500 transition-colors">
                                    <Check size={16} className="text-slate-600 group-hover:text-black" />
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Footer Tip */}
                <div className="px-6 py-4 bg-slate-950/50 border-t border-white/5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black text-center">
                        Choose the desired portion to add to cart
                    </p>
                </div>
            </div>
        </div>
    );
};
