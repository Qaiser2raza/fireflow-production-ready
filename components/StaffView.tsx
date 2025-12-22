
import React, { useState } from 'react';
import { useAppContext } from '../App';
import { Server } from '../types';
import { User, Plus, Trash2, Shield, Hash, Bike } from 'lucide-react';

export const StaffView: React.FC = () => {
  const { servers, addServer, deleteServer, currentUser } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Server>>({
    name: '',
    role: 'WAITER',
    pin: '',
    activeTables: 0
  });

  if (currentUser?.role !== 'MANAGER') return <div className="h-full flex items-center justify-center text-slate-500 uppercase">Access Denied</div>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.pin) return;
    
    addServer({
      id: `S-${Math.floor(Math.random() * 1000)}`,
      ...formData
    } as Server);
    setIsModalOpen(false);
    setFormData({ name: '', role: 'WAITER', pin: '', activeTables: 0 });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Revoke access for this user?')) deleteServer(id);
  };

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col overflow-hidden">
      <div className="p-8 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <div>
            <h2 className="text-gold-500 text-xs font-bold uppercase tracking-[0.2em] mb-1">Human Resources</h2>
            <h1 className="text-3xl font-serif text-white">Staff & Access</h1>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-6 py-3 bg-gold-500 hover:bg-gold-400 text-black font-bold uppercase tracking-widest rounded shadow-lg shadow-gold-500/20 flex items-center gap-2"
          >
             <Plus size={18} /> Add User
          </button>
      </div>

      <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto">
        {servers.map(server => (
          <div key={server.id} className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex items-center justify-between group">
             <div className="flex items-center gap-4">
               <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border
                 ${server.role === 'MANAGER' ? 'bg-gold-500 text-black border-gold-500' : 
                   server.role === 'DRIVER' ? 'bg-blue-600 text-white border-blue-500' :
                   'bg-slate-800 text-slate-400 border-slate-700'}
               `}>
                 {server.role === 'DRIVER' ? <Bike size={20}/> : <User />}
               </div>
               <div>
                 <div className="text-white font-bold text-lg">{server.name}</div>
                 <div className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-2">
                    {server.role === 'MANAGER' && <Shield size={12} className="text-gold-500" />}
                    {server.role}
                 </div>
               </div>
             </div>
             
             <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest">PIN</div>
                  <div className="font-mono text-slate-300">****</div>
                </div>
                {server.id !== currentUser.id && (
                  <button onClick={() => handleDelete(server.id)} className="w-8 h-8 rounded bg-red-900/20 text-red-500 flex items-center justify-center hover:bg-red-900/50">
                    <Trash2 size={14} />
                  </button>
                )}
             </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
           <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-700 p-8 rounded-2xl w-96 space-y-4 shadow-2xl">
              <h2 className="text-white font-serif text-xl mb-4">Add New User</h2>
              
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase mb-1 block">Full Name</label>
                <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white outline-none focus:border-gold-500" />
              </div>

              <div>
                <label className="text-xs text-slate-500 font-bold uppercase mb-1 block">Role</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as any})} className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white outline-none focus:border-gold-500">
                  <option value="WAITER">Waiter</option>
                  <option value="CASHIER">Cashier</option>
                  <option value="DRIVER">Rider / Driver</option>
                  <option value="MANAGER">Manager</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-500 font-bold uppercase mb-1 block">4-Digit PIN</label>
                <input required maxLength={4} value={formData.pin} onChange={e => setFormData({...formData, pin: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white outline-none focus:border-gold-500 font-mono tracking-widest text-center" />
              </div>

              <div className="flex gap-2 pt-4">
                 <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 rounded text-slate-400 font-bold uppercase text-xs">Cancel</button>
                 <button type="submit" className="flex-1 py-3 bg-gold-500 text-black rounded font-bold uppercase text-xs">Create User</button>
              </div>
           </form>
        </div>
      )}
    </div>
  );
};
