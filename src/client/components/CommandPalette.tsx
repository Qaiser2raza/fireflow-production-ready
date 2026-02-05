import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Zap } from 'lucide-react';

interface Command {
    id: string;
    label: string;
    shortcut?: string;
    category: string;
    action: () => void;
    icon?: string;
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    commands: Command[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, commands }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filteredCommands = useMemo(() => {
        if (!searchQuery) return commands;

        const query = searchQuery.toLowerCase();
        return commands.filter(
            (cmd) =>
                cmd.label.toLowerCase().includes(query) ||
                cmd.category.toLowerCase().includes(query) ||
                cmd.shortcut?.toLowerCase().includes(query)
        );
    }, [commands, searchQuery]);

    const groupedCommands = useMemo(() => {
        const groups: Record<string, Command[]> = {};
        filteredCommands.forEach((cmd) => {
            if (!groups[cmd.category]) {
                groups[cmd.category] = [];
            }
            groups[cmd.category].push(cmd);
        });
        return groups;
    }, [filteredCommands]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [searchQuery]);

    useEffect(() => {
        if (!isOpen) {
            setSearchQuery('');
            setSelectedIndex(0);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const cmd = filteredCommands[selectedIndex];
                if (cmd) {
                    cmd.action();
                    onClose();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, filteredCommands, selectedIndex, onClose]);

    if (!isOpen) return null;

    let globalIndex = 0;

    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-start justify-center pt-32 px-4">
            <div className="bg-[#0f172a] rounded-2xl border border-slate-800 shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 bg-[#0b0f19]">
                    <div className="flex items-center gap-3">
                        <Zap className="text-gold-500" size={24} />
                        <h2 className="text-white font-black text-xl uppercase tracking-tight">Command Palette</h2>
                        <button
                            onClick={onClose}
                            className="ml-auto p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-white"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Search Input */}
                    <div className="mt-4 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Type to search commands..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-slate-600 outline-none focus:border-gold-500/50 transition-colors text-sm"
                        />
                    </div>
                </div>

                {/* Commands List */}
                <div className="max-h-[400px] overflow-y-auto">
                    {filteredCommands.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 text-sm">
                            No commands found for "{searchQuery}"
                        </div>
                    ) : (
                        Object.entries(groupedCommands).map(([category, cmds]) => (
                            <div key={category} className="p-4">
                                <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 px-2">
                                    {category}
                                </div>
                                <div className="space-y-1">
                                    {cmds.map((cmd) => {
                                        const currentIndex = globalIndex++;
                                        return (
                                            <button
                                                key={cmd.id}
                                                onClick={() => {
                                                    cmd.action();
                                                    onClose();
                                                }}
                                                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left ${currentIndex === selectedIndex
                                                        ? 'bg-gold-500 text-black'
                                                        : 'hover:bg-slate-800/50 text-slate-300'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {cmd.icon && <span className="text-lg">{cmd.icon}</span>}
                                                    <span className="text-sm font-bold">{cmd.label}</span>
                                                </div>
                                                {cmd.shortcut && (
                                                    <kbd
                                                        className={`text-[10px] font-mono px-2 py-1 rounded border ${currentIndex === selectedIndex
                                                                ? 'bg-black/20 border-black/30 text-black'
                                                                : 'bg-slate-900 border-slate-700 text-slate-400'
                                                            }`}
                                                    >
                                                        {cmd.shortcut}
                                                    </kbd>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-slate-800 bg-[#0b0f19] flex items-center justify-between text-[10px] text-slate-500">
                    <div className="flex gap-4">
                        <span><kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">↑↓</kbd> Navigate</span>
                        <span><kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">Enter</kbd> Select</span>
                        <span><kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">Esc</kbd> Close</span>
                    </div>
                    <span className="font-mono">? for help</span>
                </div>
            </div>
        </div>
    );
};
