import React from 'react';

interface GuestManagerProps {
    count: number;
    onChange: (count: number) => void;
    max?: number;
}

export const GuestManager: React.FC<GuestManagerProps> = ({ count, onChange, max = 20 }) => {
    return (
        <div className="flex items-center justify-between bg-black/40 rounded-xl p-2 border border-slate-700/50">
            <button
                onClick={(e) => { e.stopPropagation(); onChange(Math.max(1, count - 1)); }}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-black text-xl transition-colors"
            >
                −
            </button>
            <div className="flex flex-col items-center min-w-[3rem]">
                <span className="text-xl font-black text-white">{count}</span>
                <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">GUESTS</span>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onChange(Math.min(max, count + 1)); }}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-black text-xl transition-colors"
            >
                +
            </button>
        </div>
    );
};
