import React, { useState, useEffect, useMemo } from 'react';
import {
    Package,
    Edit,
    Save,
    X,
    RefreshCw,
    Check,
    Scale,
    ChevronLeft,
} from 'lucide-react';
import { inventoryService, StockCount, StockCountLine, InventoryItem, StockCountAdjustment } from '../../../shared/lib/inventoryService';

interface StockCountDetailViewProps {
    countId: string;
    onClose: () => void;
    onBack: () => void;
    onFinalizeComplete: () => void;
}

interface EditableLine extends StockCountLine {
    editing: boolean;
    tempExpected: string;
    tempCounted: string;
}

export const StockCountDetailView: React.FC<StockCountDetailViewProps> = ({ countId, onClose, onBack, onFinalizeComplete }) => {
    const [count, setCount] = useState<StockCount | null>(null);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [lines, setLines] = useState<EditableLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [finalizing, setFinalizing] = useState(false);
    const [finalizeResult, setFinalizeResult] = useState<{ adjustments: StockCountAdjustment[]; count: StockCount } | null>(null);

    useEffect(() => {
        loadCountDetail();
        loadItems();
    }, [countId]);

    const loadCountDetail = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await inventoryService.getStockCountById(countId);
            setCount(data.stockCount);
            const apiLines = data.stockCount.lines || [];
            setLines(apiLines.map(l => ({
                ...l,
                editing: false,
                tempExpected: String(l.expectedQuantity || 0),
                tempCounted: String(l.countedQuantity || 0),
            })));
        } catch (e: any) {
            setError(e.message || 'Failed to load stock count');
        } finally {
            setLoading(false);
        }
    };

    const loadItems = async () => {
        try {
            const data = await inventoryService.getAllItems();
            setItems(data.items || []);
        } catch (e: any) {
            console.error('Failed to load items:', e);
        }
    };

    const getItemInfo = (itemId: string): { name: string; unit: string; currentStock: number } => {
        const item = items.find(i => i.id === itemId);
        return item
            ? { name: item.name, unit: item.unitOfMeasure, currentStock: item.currentStock }
            : { name: 'Unknown', unit: '—', currentStock: 0 };
    };

    const handleEditLine = (lineId: string) => {
        setLines(prev => prev.map(l =>
            l.id === lineId
                ? { ...l, editing: true, tempExpected: String(l.expectedQuantity || 0), tempCounted: String(l.countedQuantity || 0) }
                : l
        ));
    };

    const handleCancelEdit = (lineId: string) => {
        setLines(prev => prev.map(l => {
            if (l.id === lineId) {
                return { ...l, editing: false, tempExpected: String(l.expectedQuantity || 0), tempCounted: String(l.countedQuantity || 0) };
            }
            return l;
        }));
    };

    const handleSaveLine = async (line: EditableLine) => {
        try {
            await inventoryService.addStockCountLine(countId, {
                inventoryItemId: line.inventoryItemId,
                expectedQuantity: parseFloat(line.tempExpected),
                countedQuantity: parseFloat(line.tempCounted),
            });
            setLines(prev => prev.map(l =>
                l.id === line.id
                    ? { ...l, editing: false, expectedQuantity: parseFloat(line.tempExpected), countedQuantity: parseFloat(line.tempCounted) }
                    : l
            ));
        } catch (e: any) {
            setError(e.message || 'Failed to update line');
        }
    };
        const handleAddLine = () => {
        const availableItems = items.filter(i => !lines.some(l => l.inventoryItemId === i.id));
        if (availableItems.length === 0) {
            setError('All inventory items are already in this count');
            return;
        }
        const firstAvailable = availableItems[0];
        setLines(prev => [...prev, {
            id: `new-${Date.now()}`,
            inventoryItemId: firstAvailable.id,
            inventoryItemName: firstAvailable.name,
            expectedQuantity: firstAvailable.currentStock,
            countedQuantity: firstAvailable.currentStock,
            createdAt: new Date(),
            editing: true,
            tempExpected: String(firstAvailable.currentStock),
            tempCounted: String(firstAvailable.currentStock),
        }]);
    };

    const handleFinalize = async () => {
        if (!window.confirm('Finalize this stock count? Adjustments will be created for any variance.')) return;

        setFinalizing(true);
        setError(null);
        try {
            const result = await inventoryService.finalizeStockCount(countId);
            setFinalizeResult({
                adjustments: result.adjustments || [],
                count: result.stockCount,
            });
            setLines([]);
            setCount(result.stockCount);
            onFinalizeComplete();
        } catch (e: any) {
            const msg = e.message;
            if (msg.includes('403') || msg.includes('forbidden')) {
                setError('Permission denied - Manager access required');
            } else {
                setError(msg || 'Failed to finalize stock count');
            }
        } finally {
            setFinalizing(false);
        }
    };

    const summary = useMemo(() => {
        return lines.reduce((acc, line) => {
            const diff = (line.countedQuantity || 0) - (line.expectedQuantity || 0);
            return {
                totalLines: acc.totalLines + 1,
                totalVariance: acc.totalVariance + diff,
                hasVariance: acc.hasVariance || diff !== 0,
            };
        }, { totalLines: 0, totalVariance: 0, hasVariance: false });
    }, [lines]);

    if (loading) {
        return (
            <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
                <div className="bg-[#080d1a] border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl p-8 text-center">
                    <div className="w-10 h-10 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-emerald-400 text-sm font-black uppercase tracking-widest">Loading Stock Count...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-[#080d1a] border border-slate-800 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-800 bg-slate-900/20 shrink-0">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onBack}
                            className="w-8 h-8 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
                            <Scale size={20} className="text-emerald-500" />
                            {finalizeResult ? 'Count Finalized' : 'Stock Count'}
                        </h2>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    {error && (
                        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <p className="text-red-400 text-xs font-bold uppercase tracking-widest">{error}</p>
                        </div>
                    )}

                    {!finalizeResult ? (
                        <>
                            {/* Count Summary */}
                            {count && (
                                <div className="mb-6 p-4 bg-slate-900/30 border border-slate-800 rounded-2xl">
                                    <div className="grid grid-cols-3 gap-4 text-center">
                                        <div>
                                            <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest block mb-1">Status</span>
                                            <span className={`text-sm font-black ${count.status === 'OPEN' ? 'text-emerald-400' : 'text-slate-400'}`}>{count.status}</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest block mb-1">Created</span>
                                            <span className="text-sm font-black text-white font-mono">{new Date(count.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest block mb-1">Lines</span>
                                            <span className="text-sm font-black text-white">{summary.totalLines}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Lines Table */}
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Package size={12} />
                                        Count Lines
                                    </h3>
                                    {count?.status === 'OPEN' && (
                                        <button
                                            onClick={handleAddLine}
                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1"
                                        >
                                            <Package size={12} />
                                            Add Item
                                        </button>
                                    )}
                                </div>

                                {lines.length === 0 ? (
                                    <div className="py-12 text-center text-slate-600">
                                        <Scale size={32} className="mx-auto mb-3 opacity-50" />
                                        <p className="text-[10px] font-black uppercase tracking-widest">No count lines</p>
                                        <p className="text-slate-600 text-xs mt-2">Add items to start counting stock</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {lines.map((line) => {
                                            const itemInfo = getItemInfo(line.inventoryItemId || '');
                                            const diff = (line.countedQuantity || 0) - (line.expectedQuantity || 0);
                                            return (
                                                <div key={line.id} className="p-4 bg-slate-900/30 border border-slate-800 rounded-2xl">
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div>
                                                            <h4 className="text-xs font-black text-white uppercase tracking-tight">
                                                                {line.inventoryItemName || itemInfo.name}
                                                            </h4>
                                                            <p className="text-[10px] text-slate-500 font-bold uppercase">
                                                                {itemInfo.unit} • Current Stock: {itemInfo.currentStock.toFixed(3)}
                                                            </p>
                                                        </div>
                                                        {count?.status === 'OPEN' && !line.editing && (
                                                            <button
                                                                onClick={() => handleEditLine(line.id)}
                                                                className="w-7 h-7 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                                                            >
                                                                <Edit size={14} />
                                                            </button>
                                                        )}
                                                    </div>

                                                    {line.editing ? (
                                                        <div className="grid grid-cols-3 gap-4 items-end">
                                                            <div>
                                                                <label className="block text-[8px] text-slate-600 font-black uppercase tracking-widest mb-1">Expected</label>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                                                                    value={line.tempExpected}
                                                                    onChange={(e) => setLines(prev => prev.map(l => l.id === line.id ? { ...l, tempExpected: e.target.value } : l))}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[8px] text-slate-600 font-black uppercase tracking-widest mb-1">Counted</label>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                                                                    value={line.tempCounted}
                                                                    onChange={(e) => setLines(prev => prev.map(l => l.id === line.id ? { ...l, tempCounted: e.target.value } : l))}
                                                                />
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => handleSaveLine(line)}
                                                                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center"
                                                                >
                                                                    <Save size={10} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleCancelEdit(line.id)}
                                                                    className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center"
                                                                >
                                                                    <X size={10} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-4 gap-4">
                                                            <div>
                                                                <span className="text-[8px] text-slate-600 font-black uppercase">Expected</span>
                                                                <p className="text-white font-mono text-xs">{line.expectedQuantity?.toFixed(2) || '0.00'}</p>
                                                            </div>
                                                            <div>
                                                                <span className="text-[8px] text-slate-600 font-black uppercase">Counted</span>
                                                                <p className="text-white font-mono text-xs">{line.countedQuantity?.toFixed(2) || '0.00'}</p>
                                                            </div>
                                                            <div>
                                                                <span className="text-[8px] text-slate-600 font-black uppercase">Variance</span>
                                                                <p className={`font-mono text-xs font-black ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                                                    {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <span className="text-[8px] text-slate-600 font-black uppercase">Adj. Value</span>
                                                                <p className="text-white font-mono text-xs">—</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Finalize Button */}
                            {count?.status === 'OPEN' && lines.length > 0 && (
                                <div className="sticky bottom-0 pt-6 border-t border-slate-800 bg-[#080d1a]">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                                                Total Variance: <span className={`font-mono ${summary.totalVariance > 0 ? 'text-emerald-400' : summary.totalVariance < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                                    {summary.totalVariance > 0 ? '+' : ''}{summary.totalVariance.toFixed(2)}
                                                </span>
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleFinalize}
                                            disabled={finalizing}
                                            className={`px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg shadow-amber-600/20 disabled:opacity-50 transition-all flex items-center gap-2`}
                                        >
                                            {finalizing ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                                    Finalizing...
                                                </>
                                            ) : (
                                                <>
                                                    <Scale size={14} />
                                                    Finalize Count
                                                </>
                                            )}
                                        </button>
                                </div>
                                {count?.status === 'OPEN' && (
                                    <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest text-center">
                                        Only MANAGER, ADMIN, and SUPER_ADMIN roles can finalize
                                    </p>
                                )}
                                </div>
                            )}
                        </>
                    ) : (
                        /* Finalize Result */
                        <div className="text-center py-8">
                            <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Check size={24} className="text-emerald-400" />
                            </div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tight mb-6">
                                Stock Count Finalized
                            </h2>

                            <div className="mb-6">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2 justify-center">
                                    <Scale size={12} />
                                    Adjustment Summary
                                </h3>
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-3">
                                        <span className="text-[9px] text-slate-600 font-black uppercase block mb-1">Total Lines</span>
                                        <span className="text-lg font-black text-white">{finalizeResult.adjustments.length}</span>
                                    </div>
                                    <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-3">
                                        <span className="text-[9px] text-slate-600 font-black uppercase block mb-1">With Variance</span>
                                        <span className="text-lg font-black text-emerald-400">
                                            {finalizeResult.adjustments.filter(a => Math.abs(a.difference) > 0).length}
                                        </span>
                                    </div>
                                    <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-3">
                                        <span className="text-[9px] text-slate-600 font-black uppercase block mb-1">Total Adj.</span>
                                        <span className="text-lg font-black text-amber-400">
                                            {finalizeResult.adjustments.reduce((sum, a) => sum + Math.abs(a.difference), 0).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {finalizeResult.adjustments.length > 0 && (
                                <div className="mb-6">
                                    <h4 className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2">Adjustments</h4>
                                    <div className="space-y-2 text-left">
                                        {finalizeResult.adjustments.map((adj, i) => {
                                            const isPositive = adj.difference > 0;
                                            const hasMovement = adj.movementId !== null;
                                            return (
                                                <div key={i} className="p-3 bg-slate-900/30 border border-slate-800 rounded-xl">
                                                    <div className="flex items-center justify-between text-xs mb-1">
                                                        <span className="text-slate-300 font-bold">{adj.inventoryItemName || adj.inventoryItemId.slice(-6).toUpperCase()}</span>
                                                        <span className={`font-mono font-black ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {isPositive ? '+' : ''}{adj.difference.toFixed(2)}
                                                        </span>
                                                    </div>
                                                    {hasMovement && (
                                                        <div className="text-[9px] text-slate-600 font-mono">
                                                            Movement: {adj.movementId!.slice(-8).toUpperCase()} · Qty: {adj.movementQuantity}
                                                        </div>
                                                    )}
                                                    {!hasMovement && Math.abs(adj.difference) > 0 && (
                                                        <div className="text-[9px] text-amber-600 font-mono">
                                                            No adjustment movement (variance within threshold)
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-4 border-t border-slate-800 bg-slate-900/20 shrink-0 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all border border-slate-800"
                    >
                        Close
                    </button>
                    {!finalizeResult && (
                        <button
                            onClick={() => { loadCountDetail(); }}
                            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all border border-slate-800 flex items-center gap-2"
                        >
                            <RefreshCw size={12} />
                            Refresh
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};