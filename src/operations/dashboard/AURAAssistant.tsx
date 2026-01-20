
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { X, Send, Sparkles, Loader2, Command, Bot, MessageSquare, Terminal } from 'lucide-react';
import { Order, Table, MenuItem, Server } from '../../shared/types';

interface AURAAssistantProps {
  onClose: () => void;
  context: {
    orders: Order[];
    tables: Table[];
    menuItems: MenuItem[];
    currentUser: Server | null;
  };
}

export const AURAAssistant: React.FC<AURAAssistantProps> = ({ onClose, context }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'aura', content: string }[]>([
    { role: 'aura', content: `Identity Verified. AURA Intelligence stands by for ${context.currentUser?.name || 'Authorized User'}. How may I optimize your operations?` }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const systemPrompt = `
        You are AURA (Autonomous Unified Restaurant Architect), the intelligence core of a high-performance restaurant system.
        Current Restaurant Context:
        - Active Orders: ${context.orders.length}
        - Total Tables: ${context.tables.length}
        - Occupied Tables: ${context.tables.filter(t => t.status === 'OCCUPIED').length}
        - Menu Items: ${context.menuItems.length}
        - User: ${context.currentUser?.name} (Role: ${context.currentUser?.role})

        Instructions:
        1. Be concise, precise, and professional (Luxury/Elite tone).
        2. Provide actionable insights. 
        3. If asked about revenue, analyze the ${context.orders.length} active orders and their totals.
        4. Refer to yourself as AURA. Use terms like "optimizing," "throughput," "topology," and "provisioning."
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: userMsg,
        config: { systemInstruction: systemPrompt }
      });

      setMessages(prev => [...prev, { role: 'aura', content: response.text || "Error processing intelligence stream." }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'aura', content: "AURA communication relay failed. Check engine connectivity." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-slate-950 border border-gold-500/30 w-full max-w-2xl h-[600px] rounded-[2.5rem] shadow-[0_0_50px_rgba(245,158,11,0.15)] flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-500/50 to-transparent animate-pulse" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gold-500 flex items-center justify-center shadow-lg shadow-gold-500/20">
              <Bot size={24} className="text-slate-950" />
            </div>
            <div>
              <h2 className="text-white font-serif text-xl font-bold tracking-wider">AURA INTELLIGENCE</h2>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Neural Link Active</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors bg-slate-900 rounded-xl border border-slate-800">
            <X size={20} />
          </button>
        </div>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[radial-gradient(circle_at_center,_#0f172a_0%,_#020617_100%)]">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
              <div className={`max-w-[80%] p-4 rounded-[1.5rem] ${msg.role === 'user'
                  ? 'bg-gold-500 text-slate-950 font-medium'
                  : 'bg-slate-900/80 border border-slate-800 text-slate-200'
                }`}>
                {msg.role === 'aura' && <div className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">AURA Protocol</div>}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-full flex items-center gap-3">
                <Loader2 size={16} className="text-gold-500 animate-spin" />
                <span className="text-[10px] font-black text-gold-500 uppercase tracking-widest">Analyzing topology...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-6 bg-slate-950 border-t border-slate-800">
          <div className="flex items-center gap-4 bg-slate-900 border border-slate-700 rounded-2xl p-2 focus-within:border-gold-500/50 transition-all shadow-inner">
            <div className="p-2 bg-slate-950 rounded-xl text-slate-600">
              <Terminal size={18} />
            </div>
            <input
              className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder-slate-600 font-medium"
              placeholder="Query AURA Core..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="w-12 h-12 bg-gold-500 text-slate-950 rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
          <div className="mt-3 flex justify-center gap-4">
            <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Shift Link Encrypted</span>
            <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">•</span>
            <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">v4.1 Neural Engine</span>
          </div>
        </div>
      </div>
    </div>
  );
};
