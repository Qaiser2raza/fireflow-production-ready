import React from 'react';
import { BarChart3, Bell, Search, History } from 'lucide-react';

interface ActionRibbonProps {
    onSearch: (query: string) => void;
    activeOrdersCount: number;
    totalCapacity?: number;
    occupiedCapacity?: number;
    onRecallClick?: () => void;
}

export const ActionRibbon: React.FC<ActionRibbonProps> = ({
    onSearch,
    activeOrdersCount,
    totalCapacity = 0,
    occupiedCapacity = 0,
    onRecallClick
}) => {
    return (
        <div className="bg-[#0a0e1a] border-b border-slate-800/50 px-6 py-4 flex items-center justify-between shadow-xl relative z-10">
            <div className="flex items-center gap-6">
                <div>
                    <h2 className="text-[10px] text-gold-500 font-black uppercase tracking-[0.2em] mb-1">Dine-In Hub</h2>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-xs font-bold text-white tracking-widest uppercase">{activeOrdersCount} Active Tables</span>
                    </div>
                </div>

                <div className="h-8 w-[1px] bg-slate-800 mx-2" />

                {/* Capacity Info */}
                <div className="hidden lg:block">
                    <h2 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">Hall Capacity</h2>
                    <div className="flex items-center gap-3">
                        <div className="bg-slate-900 h-2 w-32 rounded-full overflow-hidden border border-slate-800">
                            <div
                                className="bg-blue-500 h-full transition-all duration-500"
                                style={{ width: `${Math.min(100, (occupiedCapacity / totalCapacity) * 100) || 0}%` }}
                            />
                        </div>
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">
                            {occupiedCapacity}/{totalCapacity} Guests
                        </span>
                    </div>
                </div>

                {/* Intelligent Search */}
                <div className="relative ml-4">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search table, guest or status..."
                        onChange={(e) => onSearch(e.target.value)}
                        className="bg-black/20 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-300 focus:outline-none focus:border-gold-500/50 w-80 transition-all placeholder:text-slate-600 shadow-inner"
                    />
                </div>
            </div>

            <div className="flex items-center gap-4">
                <button
                    onClick={onRecallClick}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/20 transition-all active:scale-95 group"
                >
                    <History size={16} className="group-hover:rotate-[-45deg] transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Recall Drafts</span>
                </button>

                <div className="h-8 w-[1px] bg-slate-800 mx-2" />

                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Aura Performance</span>
                        <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className={`w-1 h-3 rounded-full ${i <= 4 ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-slate-800'}`} />
                                ))}
                            </div>
                            <span className="text-xs font-black text-white uppercase tracking-tighter">Optimal</span>
                        </div>
                    </div>

                    <button className="relative p-2.5 bg-slate-800 rounded-xl text-slate-300 hover:text-white transition-all hover:bg-slate-700">
                        <Bell size={18} />
                        <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-[#0a0e1a]" />
                    </button>

                    <button className="p-2.5 bg-slate-800 rounded-xl text-slate-300 hover:text-white transition-all hover:bg-slate-700">
                        <BarChart3 size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};
