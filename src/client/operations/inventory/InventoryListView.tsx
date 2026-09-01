import React, { useState, useEffect, useMemo } from 'react';
import {
    Package,
    Search,
    ChevronRight,
    ArrowDown,
    ArrowUp,
    AlertTriangle,
    RefreshCw,
    Boxes,
    TrendingUp,
} from 'lucide-react';
import { inventoryService, InventoryItem, InventoryMovement } from '../../../shared/lib/inventoryService';
import { useAppContext } from '../../contexts/AppContext';

interface InventoryListViewProps {
    onReceiveStock?: () => void;
}

export const InventoryListView: React.FC<InventoryListViewProps> = ({ onReceiveStock }) => {
    const { currentUser } = useAppContext();
    const canManageInventory = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(currentUser?.role ?? '');
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showNegativeOnly, setShowNegativeOnly] = useState(false);

    useEffect(() => {
        loadItems();
    }, []);

    const loadItems = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await inventoryService.getAllItems();
            setItems(data.items || []);
        } catch (e: any) {
            setError(e.message || 'Failed to load inventory items');
        } finally {
            setLoading(false);
        }
    };

    const loadItemDetail = async (item: InventoryItem) => {
        setSelectedItem(item);
        setDetailLoading(true);
        setMovements([]);
        try {
            const [detail, movementData] = await Promise.all([
                inventoryService.getItemById(item.id),
                inventoryService.getMovements(item.id, 50),
            ]);
            setSelectedItem(detail.item);
            setMovements(movementData.movements || []);
        } catch (e: any) {
            console.error('Failed to load item detail:', e);
        } finally {
            setDetailLoading(false);
        }
    };

    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const matchesSearch = searchQuery === '' ||
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.category.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesNegative = !showNegativeOnly || item.isNegative;
            return matchesSearch && matchesNegative;
        });
    }, [items, searchQuery, showNegativeOnly]);

    const stats = useMemo(() => ({
        total: items.length,
        negativeCount: items.filter(i => i.isNegative).length,
        totalValue: items.reduce((sum, i) => sum + i.totalCostBasis, 0),
        avgWAC: items.length > 0
            ? items.reduce((sum, i) => sum + i.averageUnitCost, 0) / items.length
            : 0,
    }), [items]);

    const getMovementIcon = (type: string) => {
        switch (type) {
            case 'RECEIVE': return <ArrowDown size={12} className="text-emerald-400" />;
            case 'CONSUME': return <ArrowUp size={12} className="text-red-400" />;
            case 'ADJUSTMENT': return <RefreshCw size={12} className="text-amber-400" />;
            default: return <Package size={12} className="text-slate-400" />;
        }
    };

    const formatMovementType = (type: string) => {
        return type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-[#070b14]">
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                    <p className="text-emerald-400 font-black text-xs uppercase tracking-widest mt-4">Loading Inventory...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex h-full bg-[#070b14] text-slate-200 overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0">
                <header className="px-6 pt-6 pb-4 flex flex-col gap-4 shrink-0 border-b border-slate-800/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <h1 className="text-2xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
                                <Package className="text-emerald-500" size={24} />
                                Inventory
                            </h1>
                            <div className="hidden lg:flex items-center gap-4 border-l border-slate-800 pl-6">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Items</span>
                                    <span className="text-base font-black text-white">{stats.total}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Negative</span>
                                    <span className={`text-base font-black ${stats.negativeCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{stats.negativeCount}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Value</span>
                                    <span className="text-base font-black text-emerald-400">Rs. {stats.totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            {canManageInventory && onReceiveStock && (
                                <button
                                    onClick={onReceiveStock}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20"
                                >
                                    <ArrowDown size={14} />
                                    Receive Stock
                                </button>
                            )}
                            <button
                                onClick={loadItems}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-700"
                            >
                                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                                Refresh
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-3 items-center">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={16} />
                            <input
                                type="text"
                                placeholder="SEARCH BY NAME OR CATEGORY..."
                                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-xs font-bold focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all uppercase tracking-wider text-white placeholder:text-slate-600"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setShowNegativeOnly(!showNegativeOnly)}
                            className={`px-4 py-3 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all border ${
                                showNegativeOnly
                                    ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30'
                                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                            }`}
                        >
                            <AlertTriangle size={14} />
                            Negative Only
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
                    {error && (
                        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <p className="text-red-400 text-xs font-bold">{error}</p>
                            <button onClick={loadItems} className="text-red-300 text-[10px] underline mt-2">Retry</button>
                        </div>
                    )}

                    {filteredItems.length === 0 && !error && (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <Boxes size={48} className="text-slate-700 mb-4" />
                            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
                                {searchQuery || showNegativeOnly ? 'No items match your filters' : 'No inventory items found'}
                            </p>
                            <p className="text-slate-600 text-xs mt-2">
                                {searchQuery || showNegativeOnly ? 'Try adjusting your search or filters' : 'Inventory items will appear here after receiving stock'}
                            </p>
                        </div>
                    )}

                    {filteredItems.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {filteredItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => loadItemDetail(item)}
                                    className={`p-4 bg-[#0c111d] border rounded-2xl text-left transition-all hover:scale-[1.01] hover:shadow-lg ${
                                        selectedItem?.id === item.id
                                            ? 'border-emerald-500/50 shadow-emerald-500/10'
                                            : item.isNegative
                                                ? 'border-red-500/30 hover:border-red-500/50'
                                                : 'border-slate-800 hover:border-slate-700'
                                    }`}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                                item.isNegative ? 'bg-red-500/10' : 'bg-emerald-500/10'
                                            }`}>
                                                <Package size={18} className={item.isNegative ? 'text-red-400' : 'text-emerald-400'} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-white uppercase tracking-tight truncate max-w-[180px]">
                                                    {item.name}
                                                </h3>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase">{item.category}</p>
                                            </div>
                                        </div>
                                        {item.isNegative && (
                                            <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-[8px] font-black text-red-400 uppercase tracking-widest">
                                                Negative
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">Stock</p>
                                            <p className={`text-base font-black ${item.isNegative ? 'text-red-400' : 'text-white'}`}>
                                                {item.currentStock.toFixed(2)}
                                            </p>
                                            <p className="text-[9px] text-slate-600 font-bold uppercase">{item.unitOfMeasure}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">WAC</p>
                                            <p className="text-base font-black text-emerald-400">
                                                Rs. {item.averageUnitCost.toFixed(2)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">Min</p>
                                            <p className="text-base font-black text-slate-400">
                                                {item.minimumStock.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>

                                    {item.currentStock < item.minimumStock && !item.isNegative && (
                                        <div className="mt-3 flex items-center gap-2 text-amber-400 text-[9px] font-black uppercase tracking-widest">
                                            <AlertTriangle size={10} />
                                            Below minimum stock level
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className={`w-full md:w-[480px] bg-[#0c111d] border-l border-slate-800 flex flex-col transition-all duration-300 ${
                selectedItem ? 'translate-x-0' : 'translate-x-full hidden md:flex'
            }`}>
                {selectedItem ? (
                    <>
                        <div className="p-6 border-b border-slate-800 shrink-0">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                        selectedItem.isNegative ? 'bg-red-500/10' : 'bg-emerald-500/10'
                                    }`}>
                                        <Package size={22} className={selectedItem.isNegative ? 'text-red-400' : 'text-emerald-400'} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-white uppercase tracking-tight">{selectedItem.name}</h2>
                                        <p className="text-xs text-slate-500 font-bold uppercase">{selectedItem.category}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setSelectedItem(null); setMovements([]); }}
                                    className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>

                            {selectedItem.isNegative && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 mb-4">
                                    <AlertTriangle size={14} className="text-red-400 shrink-0" />
                                    <p className="text-red-400 text-[10px] font-black uppercase tracking-widest">
                                        Stock is in negative — receive stock to reconcile
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                                    <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Current Stock</p>
                                    <p className={`text-lg font-black ${selectedItem.isNegative ? 'text-red-400' : 'text-white'}`}>
                                        {selectedItem.currentStock.toFixed(3)} {selectedItem.unitOfMeasure}
                                    </p>
                                </div>
                                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                                    <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">WAC / Unit</p>
                                    <p className="text-lg font-black text-emerald-400">
                                        Rs. {selectedItem.averageUnitCost.toFixed(2)}
                                    </p>
                                </div>
                                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                                    <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Total Value</p>
                                    <p className="text-lg font-black text-slate-300">
                                        Rs. {selectedItem.totalCostBasis.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-3">
                                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                                    <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Last Unit Cost</p>
                                    <p className="text-sm font-black text-slate-300">Rs. {selectedItem.unitCost.toFixed(2)}</p>
                                </div>
                                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                                    <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Min. Stock</p>
                                    <p className="text-sm font-black text-slate-300">{selectedItem.minimumStock.toFixed(2)} {selectedItem.unitOfMeasure}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <div className="px-6 py-4 border-b border-slate-800/50 flex items-center justify-between shrink-0">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <TrendingUp size={12} />
                                    Movement History
                                </h3>
                                <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
                                    {movements.length} entries
                                </span>
                            </div>

                            {detailLoading && (
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                                </div>
                            )}

                            {!detailLoading && movements.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <Package size={32} className="text-slate-700 mb-3" />
                                    <p className="text-slate-600 text-xs font-bold uppercase tracking-widest">No movements recorded</p>
                                    <p className="text-slate-700 text-[10px] mt-1">Stock movements will appear here after receiving or consuming inventory</p>
                                </div>
                            )}

                            {!detailLoading && movements.length > 0 && (
                                <div className="divide-y divide-slate-800/30">
                                    {movements.map((movement) => (
                                        <div key={movement.id} className="px-6 py-4 hover:bg-slate-900/30 transition-colors">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                                        movement.movementType === 'RECEIVE' ? 'bg-emerald-500/10' :
                                                        movement.movementType === 'CONSUME' ? 'bg-red-500/10' :
                                                        'bg-amber-500/10'
                                                    }`}>
                                                        {getMovementIcon(movement.movementType)}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black text-white uppercase tracking-tight">
                                                            {formatMovementType(movement.movementType)}
                                                        </p>
                                                        <p className="text-[9px] text-slate-500 font-mono uppercase">
                                                            Ref: {movement.referenceType || 'N/A'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className={`text-sm font-black ${
                                                        movement.movementType === 'RECEIVE' ? 'text-emerald-400' :
                                                        movement.movementType === 'CONSUME' ? 'text-red-400' :
                                                        'text-amber-400'
                                                    }`}>
                                                        {movement.movementType === 'RECEIVE' ? '+' : movement.movementType === 'CONSUME' ? '-' : ''}
                                                        {movement.quantity.toFixed(3)}
                                                    </p>
                                                    <p className="text-[9px] text-slate-600 font-mono">
                                                        @ Rs. {movement.unitCost.toFixed(2)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between text-[9px] text-slate-600">
                                                <span className="font-mono">{new Date(movement.createdAt).toLocaleString()}</span>
                                                <span className="font-mono">Rs. {movement.totalCost.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 opacity-10">
                        <Package size={64} className="text-slate-600 mb-4" />
                        <p className="text-slate-600 text-xs font-black uppercase tracking-widest text-center">
                            Select an item to view details and movement history
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};