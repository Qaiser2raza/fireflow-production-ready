import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import { Staff } from '../../shared/types';
import {
  Users, Shield, ChefHat, Bike, User,
  Plus, Edit2, Trash2, Search, Camera, LayoutGrid, List
} from 'lucide-react';
import { Card } from '../../shared/ui/Card';
import { Button } from '../../shared/ui/Button';
import { Badge } from '../../shared/ui/Badge';
import { Modal } from '../../shared/ui/Modal';
import { Input } from '../../shared/ui/Input';

const API_URL = 'http://localhost:3001/api';

export const StaffView: React.FC = () => {
  const { servers, currentUser, fetchInitialData } = useAppContext();

  // State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    role: 'SERVER',
    pin: '',
    active_tables: 0,
    image: ''
  });

  // Filter Logic
  const filteredStaff = useMemo(() => {
    let all = servers.filter((s: any) => s.status === 'active' || !s.status);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      all = all.filter((s: any) => s.name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q));
    }
    return all;
  }, [servers, searchQuery]);

  // Actions
  const handleOpenModal = (staff?: any) => {
    if (staff) {
      setEditingStaff(staff);
      setFormData({
        name: staff.name,
        role: staff.role,
        pin: staff.pin,
        active_tables: staff.active_tables || 0,
        image: staff.image || '' // Load existing image
      });
    } else {
      setEditingStaff(null);
      setFormData({
        name: '',
        role: 'SERVER',
        pin: Math.floor(1000 + Math.random() * 9000).toString(),
        active_tables: 0,
        image: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Payload Construction
    const payload = {
      restaurant_id: currentUser?.restaurant_id,
      name: formData.name,
      role: formData.role,
      pin: formData.pin,
      active_tables: formData.active_tables,
      status: 'active',
      image: formData.image // Ensure this is sent!
    };

    const url = `http://localhost:3001/api/staff`;
    const headers = { 'Content-Type': 'application/json' };

    if (editingStaff) {
      await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ...payload, id: editingStaff.id })
      });
    } else {
      await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    }

    if (fetchInitialData) fetchInitialData();
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to terminate this staff member?')) {
      await fetch(`${API_URL}/staff?id=${id}`, { method: 'DELETE' });
      if (fetchInitialData) fetchInitialData();
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#020617] overflow-hidden">

      {/* HEADER */}
      <div className="p-6 border-b border-slate-800 shrink-0 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-slate-900/50 backdrop-blur-md">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white mb-2">Personnel Roster</h1>
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Shield size={16} className="text-gold-500" />
            <span>Active Agents: <strong className="text-white">{filteredStaff.length}</strong></span>
          </div>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              type="text"
              placeholder="Search Name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:border-gold-500 outline-none transition-all placeholder:text-slate-600 shadow-inner"
            />
          </div>
          <Button onClick={() => handleOpenModal()} icon={<Plus size={18} />}>Recruit</Button>
        </div>
      </div>

      {/* STAFF GRID */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          {filteredStaff.map((staff: any) => (
            <StaffCard key={staff.id} staff={staff} onEdit={handleOpenModal} onDelete={handleDelete} />
          ))}

          {filteredStaff.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 opacity-40">
              <Users size={64} className="mb-4 text-slate-500" />
              <p className="text-slate-400 font-bold tracking-widest uppercase">No Records Found</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStaff ? `Edit Profile` : "New Recruitment"}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Image Input */}
          <div className="flex items-start gap-4 p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
            <div className="w-20 h-20 rounded-2xl bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center overflow-hidden shrink-0 shadow-lg relative group">
              {formData.image ? (
                <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <Camera size={24} className="text-slate-500" />
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-[10px] font-bold text-white uppercase">Change</span>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <label className="text-xs font-bold text-gold-500 uppercase tracking-widest">Digital ID Photo</label>
              <Input
                placeholder="https://..."
                value={formData.image}
                onChange={e => setFormData({ ...formData, image: e.target.value })}
                className="text-xs"
              />
              <p className="text-[10px] text-slate-500 leading-tight">Paste a direct image URL (JPG/PNG). Leave empty to use system avatar.</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              label="Full Name"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Assignment</label>
                <div className="relative">
                  <select
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:border-gold-500 outline-none appearance-none font-medium"
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="MANAGER">Manager</option>
                    <option value="SERVER">Waiter</option>
                    <option value="CHEF">Chef</option>
                    <option value="RIDER">Rider</option>
                    <option value="DRIVER">Driver</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                    <LayoutGrid size={14} />
                  </div>
                </div>
              </div>

              <Input
                label="Access PIN"
                value={formData.pin}
                onChange={e => setFormData({ ...formData, pin: e.target.value })}
                maxLength={6}
                className="font-mono tracking-[0.2em] text-center text-gold-500 font-bold"
                required
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">{editingStaff ? 'Update Records' : 'Confirm Recruitment'}</Button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

// --- NEW CARD COMPONENT ---

const StaffCard = ({ staff, onEdit, onDelete }: any) => {
  const getRoleStyle = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
      case 'MANAGER': return { color: 'text-gold-500', border: 'border-l-gold-500', bg: 'bg-gold-500/10', icon: Shield };
      case 'CHEF': return { color: 'text-red-500', border: 'border-l-red-500', bg: 'bg-red-500/10', icon: ChefHat };
      case 'RIDER':
      case 'DRIVER': return { color: 'text-blue-500', border: 'border-l-blue-500', bg: 'bg-blue-500/10', icon: Bike };
      default: return { color: 'text-purple-500', border: 'border-l-purple-500', bg: 'bg-purple-500/10', icon: User };
    }
  };

  const style = getRoleStyle(staff.role);
  const Icon = style.icon;

  return (
    <Card className={`relative overflow-hidden border-0 bg-slate-900 shadow-xl group hover:-translate-y-1 transition-all duration-300`}>
      {/* Color Strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.border.replace('border-l-', 'bg-')}`}></div>

      <div className="p-5 flex items-start gap-4">

        {/* Avatar Container */}
        <div className="relative shrink-0">
          <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden shadow-inner">
            {staff.image ? (
              <img
                src={staff.image}
                alt={staff.name}
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement?.classList.remove('overflow-hidden'); }}
              />
            ) : (
              <Icon size={28} className={style.color} />
            )}
          </div>
          {/* Status Dot */}
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-900 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></div>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${style.color}`}>
            {staff.role.replace('_', ' ')}
          </div>
          <div className="text-white font-bold text-lg truncate leading-tight mb-2">
            {staff.name}
          </div>
          <div className="flex items-center gap-2 bg-slate-950/50 p-1.5 rounded-lg w-fit border border-slate-800">
            <span className="text-[10px] text-slate-500 font-bold uppercase px-1">PIN</span>
            <span className="text-xs font-mono text-white tracking-widest">••••••</span>
          </div>
        </div>
      </div>

      {/* Hover Actions Overlay */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
        <button
          onClick={() => onEdit(staff)}
          className="flex flex-col items-center gap-1 text-white hover:scale-110 transition-transform"
        >
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shadow-lg">
            <Edit2 size={18} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest">Edit</span>
        </button>

        {staff.role !== 'SUPER_ADMIN' && (
          <button
            onClick={() => onDelete(staff.id)}
            className="flex flex-col items-center gap-1 text-white hover:scale-110 transition-transform"
          >
            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
              <Trash2 size={18} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest">Delete</span>
          </button>
        )}
      </div>
    </Card>
  );
};