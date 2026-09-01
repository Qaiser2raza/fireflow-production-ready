import React, { useState, useEffect, useMemo } from 'react';
import {
    Package,
    Search,
    ChevronLeft,
    Check,
    AlertTriangle,
    ShoppingBasket,
} from 'lucide-react';
import { inventoryService, POLine, ReceivePOResult } from '../../../shared/lib/inventoryService';

interface StockReceivingViewProps {
    onClose: () => void;
    onReceiveComplete: () => void;
}

export const StockReceivingView: React.FC<StockReceivingViewProps> = ({ onClose, onReceiveComplete }) => {
    const [poLines, setPoLines] = useState<POLine[]>([]);
    const [selectedLine, setSelectedLine] = useState<POLine | null>(null);
    const [receiveQuantity, setReceiveQuantity] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successData, setSuccessData] = useState<ReceivePOResult | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadPOLines();
    }, []);

    const loadPOLines = async () => {
        setLoading(true);
        try {
            const data = await inventoryService.getPOLInes();
            setPoLines(data.poLines || []);
        } catch (e: any) {
            setError(e.message || 'Failed to load PO lines');
        } finally {
            setLoading(false);
        }
    };

    const filteredLines = useMemo(() => {
        if (!searchQuery) return poLines;
        return poLines.filter(line =>
            line.po_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            line.inventory_item_name?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [poLines, searchQuery]);

    const handleReceive = async () => {
        if (!selectedLine) return;

        const qty = parseFloat(receiveQuantity);
        if (isNaN(qty) || qty <= 0) {
            setError('Please enter a valid quantity');
            return;
        }

        if (qty > selectedLine.quantity_remaining) {
            setError(`Maximum receiptable is ${selectedLine.quantity_remaining.toFixed(2)} units`);
            return;
        }

        setSubmitLoading(true);
        setError(null);

        try {
            const result = await inventoryService.receivePOLine(selectedLine.id, qty);
            setSuccessData(result);
        } catch (e: any) {
            const msg = e.message;
            if (msg.includes('duplicate') || msg.includes('already')) {
                setError('This receipt is pending - avoid duplicate submissions');
            } else if (msg.includes('403') || msg.includes('forbidden')) {
                setError('Permission denied - Manager access required');
                setTimeout(() => onClose(), 2000);
                return;
            } else {
                setError(msg || 'Receive failed');
            }
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleRefresh = () => {
        setSuccessData(null);
        loadPOLines();
    };

    void handleRefresh;

    if (loading) {
        return (
            <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
                <div className="bg-[#080d1a] border border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl p-8 text-center">
                    <div className="w-10 h-10 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-emerald-400 text-sm font-bold uppercase tracking-widest">Loading PO Lines...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
            <div className="bg-[#080d1a] border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden">
                {successData ? (
                    <div className="p-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                                <Check size={20} className="text-emerald-400" />
                            </div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tighter">Stock Received</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2">Received Qty</p>
                                <p className="text-2xl font-black text-emerald-400">
                                    {successData.movement.quantity?.toFixed(2) || 'N/A'} {selectedLine?.unit_of_measure}
                                </p>
                            </div>
                            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2">Movement</p>
                                <p className="text-base font-black text-white font-mono">
                                    {successData.movement.id?.slice(-8).toUpperCase()}
                                </p>
                            </div>
                            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2">Cost Basis</p>
                                <p className="text-base font-black text-white">
                                    Rs. {successData.movement.totalCost?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>

                        <div className="bg-slate-900/30 rounded-2xl p-4 mb-6 border border-slate-800">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <ShoppingBasket size={12} className="text-emerald-500" />
                                Receipt Summary
                            </h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">PO: {successData.poLine.po_number}</span>
                                    <span className="text-slate-300 font-mono">#{selectedLine?.id?.slice(-6).toUpperCase()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Item: {successData.poLine.inventory_item_name}</span>
                                    <span className="text-slate-300">{selectedLine?.unit_of_measure}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Unit Price: {successData.poLine.po_number}</span>
                                    <span className="text-slate-300 font-mono">Rs. {selectedLine?.unit_price?.toFixed(2)}</span>
                                </div>
                                {successData.isFullReceipt && (
                                    <div className="flex items-center gap-2 text-amber-400 text-xs font-black">
                                        <AlertTriangle size={10} />
                                        <span>This is a FULL receipt</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => { setSuccessData(null); }}
                                className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-slate-400 font-bold rounded-2xl text-[10px] uppercase tracking-widest transition-all"
                            >
                                Receive Another
                            </button>
                            <button
                                onClick={() => onReceiveComplete()}
                                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
                            >
                                <ShoppingBasket size={14} />
                                Close
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="px-8 py-6 border-b border-slate-800 bg-slate-900/20">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <h2 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
                                    <ShoppingBasket size={20} className="text-emerald-500" />
                                    Receive Stock
                                </h2>
                            </div>
                        </div>

                        <div className="p-8">
                            {error && (
                                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                                    <p className="text-red-400 text-xs font-bold uppercase tracking-widest">{error}</p>
                                </div>
                            )}

                            <div className="mb-4">
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search PO number or item name..."
                                        className="w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-xsfont-bold focus:outline-none focus:border-emerald-500 transition-all uppercase text-white placeholder:text-slate-600"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>

                            {filteredLines.length === 0 ? (
                                <div className="py-12 text-center text-slate-600">
                                    <Package size={48} className="mx-auto mb-4 opacity-50" />
                                    <p className="text-xs font-black uppercase tracking-widest">
                                        {searchQuery ? 'No PO lines match your search' : 'No pending receipts'}
                                    </p>
                                    <p className="text-slate-500 text-sm mt-2">
                                        {searchQuery ? 'Try a different search' : 'All purchase orders are fully received'}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3 max-h-96 overflow-y-auto">
                                    {filteredLines.map(line => (
                                        <label
                                            key={line.id}
                                            className={`flex items-start gap-4 p-4 bg-slate-900/30 border rounded-2xl cursor-pointer transition-all hover:scale-[1.01] ${
                                                selectedLine?.id === line.id ? 'border-emerald-500/50 shadow-emerald-500/10' : 'border-slate-800 hover:border-slate-700'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="poLine"
                                                checked={selectedLine?.id === line.id}
                                                onChange={() => setSelectedLine(line)}
                                                className="mt-1.5 w-4 h-4 text-emerald-500 border-slate-600 bg-slate-800 focus:ring-emerald-500"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="text-xs font-black text-white uppercase tracking-widest truncate">
                                                        {line.po_number || 'PO #' + line.id.slice(-6).toUpperCase()}
                                                    </h3>
                                                    <span className="text-[9px] text-slate-500 font-mono">
                                                        {line.quantity_ordered.toFixed(2)} / {line.quantity_received.toFixed(2)} received
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-400 truncate">{line.inventory_item_name}</p>
                                                <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                                                    <span>Qty Remaining: <span className="text-white font-bold">{line.quantity_remaining.toFixed(2)}</span></span>
                                                    <span>Unit: {line.unit_of_measure}</span>
                                                    <span>Price: Rs. {line.unit_price.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {selectedLine && !successData && (
                                <div className="mt-6 pt-6 border-t border-slate-800/50">
                                    <div className="bg-slate-900/30 rounded-2xl p-4 mb-4">
                                        <h3 className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <ShoppingBasket size={12} className="text-emerald-500" />
                                            Receipt Details
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <p className="text-slate-500 text-xs">Item</p>
                                                <p className="text-white font-bold text-xs">{selectedLine.inventory_item_name}</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500 text-xs">Unit</p>
                                                <p className="text-white font-bold text-xs">{selectedLine.unit_of_measure}</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500 text-xs">Unit Cost</p>
                                                <p className="text-white font-mono text-xs">Rs. {selectedLine.unit_price.toFixed(2)}</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500 text-xs">Ordered</p>
                                                <p className="text-white font-mono text-xs">{selectedLine.quantity_ordered.toFixed(2)}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mb-4">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                            Quantity to Receive
                                        </label>
                                        <input
                                            type="number"
                                            min="0.01"
                                            max={selectedLine.quantity_remaining.toString()}
                                            step="0.01"
                                            placeholder="Enter quantity..."
                                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-base focus:outline-none focus:border-emerald-500 transition-all"
                                            value={receiveQuantity}
                                            onChange={(e) => setReceiveQuantity(e.target.value)}
                                        />
                                        {parseFloat(receiveQuantity) > 0 && parseFloat(receiveQuantity) <= selectedLine.quantity_remaining && (
                                            <p className="mt-1 text-[9px] text-emerald-400 font-bold">
                                                Remaining after receipt: {(selectedLine.quantity_remaining - parseFloat(receiveQuantity)).toFixed(2)}
                                            </p>
                                        )}
                                    </div>

                                    <button
                                        onClick={handleReceive}
                                        disabled={submitLoading || !receiveQuantity}
                                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                                    >
                                        {submitLoading ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                                Receiving...
                                            </>
                                        ) : (
                                            <>
                                                <Check size={14} />
                                                Receive Stock
                                            </>
                                        )}
                                    </button>

                                    <button
                                        onClick={onClose}
                                        className="mt-3 w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 font-bold rounded-2xl text-[10px] uppercase tracking-widest transition-all"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};