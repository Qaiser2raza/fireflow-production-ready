
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../App';
import { Section, Table, TableStatus } from '../types';
import { Plus, Trash2, LayoutGrid, Square, Users, Copy, ChevronRight, Hash, AlertCircle, Edit2, Loader2, Maximize, Settings2, X, Save, AlertTriangle } from 'lucide-react';

export const TableManagementView: React.FC = () => {
  const { sections, tables, addSection, updateSection, deleteSection, addTable, deleteTable, currentUser, addNotification } = useAppContext();
  
  // Navigation State
  const [activeSectionId, setActiveSectionId] = useState<string>(sections[0]?.id || '');
  
  // Sync tab state when sections change (e.g. after deletion)
  useEffect(() => {
    if (!sections.some(s => s.id === activeSectionId)) {
      setActiveSectionId(sections[0]?.id || '');
    }
  }, [sections, activeSectionId]);

  // Modals
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [confirmWipeId, setConfirmWipeId] = useState<string | null>(null);

  // Forms
  const [newSectionData, setNewSectionData] = useState({ name: '', prefix: '', totalCapacity: 50 });
  const [editSectionData, setEditSectionData] = useState<Section | null>(null);
  const [newTableData, setNewTableData] = useState({ capacity: 4 });
  const [isSaving, setIsSaving] = useState(false);

  const activeSection = sections.find(s => s.id === activeSectionId);
  const activeTables = tables.filter(t => t.sectionId === activeSectionId).sort((a,b) => {
     const numA = parseInt(a.name.split('-')[1]) || 0;
     const numB = parseInt(b.name.split('-')[1]) || 0;
     return numA - numB;
  });

  if (currentUser?.role !== 'MANAGER') return <div className="h-full flex items-center justify-center text-slate-500 uppercase font-black tracking-[0.3em]">Access Denied</div>;

  const getNextTableName = (section: Section) => {
    const sectionTables = tables.filter(t => t.name.startsWith(`${section.prefix}-`));
    let maxNum = 0;
    
    sectionTables.forEach(t => {
      const parts = t.name.split('-');
      if (parts.length > 1) {
        const num = parseInt(parts[1]);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    return `${section.prefix}-${maxNum + 1}`;
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSectionData.name && newSectionData.prefix) {
      setIsSaving(true);
      
      const sectionPayload: any = { 
        name: newSectionData.name.trim(), 
        prefix: newSectionData.prefix.trim().toUpperCase(),
        totalCapacity: newSectionData.totalCapacity,
        isFamilyOnly: false 
      };

      const createdSection = await addSection(sectionPayload);
      
      if (createdSection) {
        const firstTableName = `${createdSection.prefix}-1`;
        await addTable({
          id: 'TEMP', 
          name: firstTableName,
          sectionId: createdSection.id,
          capacity: 4,
          status: TableStatus.AVAILABLE,
          lastStatusChange: new Date()
        });

        setNewSectionData({ name: '', prefix: '', totalCapacity: 50 });
        setIsSectionModalOpen(false);
        setActiveSectionId(createdSection.id);
      }
      setIsSaving(false);
    }
  };

  const handleUpdateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editSectionData) {
      setIsSaving(true);
      const success = await updateSection(editSectionData);
      if (success) {
        setIsEditModalOpen(false);
        setEditSectionData(null);
      }
      setIsSaving(false);
    }
  };

  const handleCreateTable = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeSection) return;

    setIsSaving(true);
    const nextName = getNextTableName(activeSection);
    
    const success = await addTable({
      id: 'TEMP',
      name: nextName,
      sectionId: activeSection.id,
      capacity: newTableData.capacity,
      status: TableStatus.AVAILABLE,
      lastStatusChange: new Date()
    });

    if (success) setIsTableModalOpen(false);
    setIsSaving(false);
  };

  const handleWipeSection = async () => {
    if (confirmWipeId) {
       setIsSaving(true);
       await deleteSection(confirmWipeId);
       setConfirmWipeId(null);
       setIsSaving(false);
    }
  };

  const startEditSection = () => {
    if (activeSection) {
      setEditSectionData({...activeSection});
      setIsEditModalOpen(true);
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col overflow-hidden">
       {/* Header */}
       <div className="p-8 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-gold-500 text-xs font-bold uppercase tracking-[0.2em] mb-1">Architectural Control</h2>
            <h1 className="text-3xl font-serif text-white">Precision Floor Plans</h1>
          </div>
          <button 
            onClick={() => setIsSectionModalOpen(true)} 
            className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase tracking-widest rounded-xl border border-slate-700 flex items-center gap-2 text-xs transition-all"
          >
            <LayoutGrid size={16} /> New Area
          </button>
       </div>

       {/* HORIZONTAL AREA TABS */}
       <div className="px-8 bg-slate-900/30 border-b border-slate-800 flex items-center shrink-0 h-16">
          <div className="flex gap-1 overflow-x-auto no-scrollbar h-full items-center">
             {sections.length === 0 ? (
               <div className="text-slate-600 text-[10px] uppercase font-black tracking-widest">No Active Zones</div>
             ) : (
               sections.map(section => (
                 <button
                   key={section.id}
                   onClick={() => setActiveSectionId(section.id)}
                   className={`px-8 h-full text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap border-b-2
                     ${activeSectionId === section.id 
                       ? 'border-gold-500 text-gold-500 bg-gold-500/5' 
                       : 'border-transparent text-slate-500 hover:text-slate-300'}
                   `}
                 >
                   {section.name}
                 </button>
               ))
             )}
          </div>
       </div>

       {/* CONTENT: THE DRAWING BOARD */}
       <div className="flex-1 overflow-y-auto p-10 bg-[#020617] custom-scrollbar">
          {activeSection ? (
            <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
               
               <div className="flex justify-between items-end bg-slate-900/40 p-8 rounded-[2rem] border border-slate-800/50">
                  <div>
                    <h3 className="text-3xl font-serif text-white mb-2">{activeSection.name}</h3>
                    <div className="flex items-center gap-4 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                       <span className="flex items-center gap-1.5"><Hash size={12} className="text-gold-500"/> Prefix: {activeSection.prefix}</span>
                       <span className="w-1 h-1 rounded-full bg-slate-700" />
                       <span className="flex items-center gap-1.5 cursor-pointer hover:text-gold-500 transition-colors" onClick={startEditSection}>
                          <Maximize size={12} className="text-gold-500"/> Capacity: {activeSection.totalCapacity} Guests
                          <Edit2 size={10} className="ml-1 opacity-40" />
                       </span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={startEditSection}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-widest rounded-lg border border-slate-700 transition-all flex items-center gap-2"
                    >
                      <Settings2 size={14} /> Edit Area
                    </button>
                    <button 
                      onClick={() => setConfirmWipeId(activeSection.id)}
                      className="text-red-500 hover:text-red-400 text-[10px] font-black uppercase tracking-widest px-4 py-2 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/30"
                    >
                      Wipe Area
                    </button>
                  </div>
               </div>
               
               <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {activeTables.map(table => (
                    <div key={table.id} className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] flex flex-col justify-between group h-48 relative transition-all hover:border-gold-500/40 hover:shadow-2xl hover:-translate-y-1">
                       <div className="flex justify-between items-start">
                          <div>
                             <div className="text-[10px] text-gold-500/50 font-black uppercase tracking-widest mb-1">ID: {table.name}</div>
                             <div className="text-3xl font-serif font-bold text-white leading-none">{table.name}</div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                             <button 
                               onClick={() => deleteTable(table.id)} 
                               className="p-2.5 bg-red-900/10 text-red-500 hover:bg-red-600 hover:text-white rounded-xl transition-colors border border-red-900/20"
                             >
                                <Trash2 size={14}/>
                             </button>
                          </div>
                       </div>

                       <div className="space-y-4">
                          <div className="flex items-center gap-3">
                             <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
                                <Users size={14} className="text-slate-600" />
                                <span className="text-white font-mono font-bold text-sm">{table.capacity}</span>
                             </div>
                             <div className="text-[9px] text-slate-600 font-black uppercase tracking-widest leading-tight">Standard Capacity</div>
                          </div>
                          <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden opacity-30">
                             <div className="h-full bg-gold-500 w-full" />
                          </div>
                       </div>
                    </div>
                  ))}
                  
                  {/* AUTO-NUMBERING GHOST BUTTON */}
                  <button 
                    onClick={() => handleCreateTable()}
                    disabled={isSaving}
                    className="border-2 border-dashed border-slate-800 hover:border-gold-500/30 rounded-[2rem] flex flex-col items-center justify-center gap-4 text-slate-700 hover:text-gold-500 transition-all group h-48 bg-slate-900/20 disabled:opacity-50"
                  >
                     <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-800 group-hover:border-gold-500/50 flex items-center justify-center transition-all bg-slate-950">
                        {isSaving ? <Loader2 size={24} className="animate-spin" /> : <Plus size={24} />}
                     </div>
                     <div className="text-center">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em]">Add Next Table</div>
                        <div className="text-xs font-mono opacity-50 mt-1">{activeSection ? getNextTableName(activeSection) : ''}</div>
                     </div>
                  </button>
               </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-6 animate-pulse">
               <div className="p-10 bg-slate-900 rounded-full border border-slate-800">
                  <LayoutGrid size={80} className="opacity-10" />
               </div>
               <div className="text-center">
                  <h3 className="text-xl font-serif text-slate-500 mb-2">Architectural Workspace Empty</h3>
                  <p className="text-sm max-w-xs opacity-60">Initialize an Area to begin placing physical table units.</p>
               </div>
            </div>
          )}
       </div>

       {/* MODAL: NEW AREA */}
       {isSectionModalOpen && (
         <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
           <form onSubmit={handleCreateSection} className="bg-slate-900 p-10 rounded-[3rem] w-full max-w-lg border border-slate-700 space-y-8 shadow-2xl animate-in zoom-in duration-300">
              <div className="flex items-center gap-4">
                 <div className="p-4 bg-gold-500 rounded-[1.5rem] text-black shadow-xl shadow-gold-500/20">
                    <LayoutGrid size={32} />
                 </div>
                 <div>
                    <h2 className="text-white font-serif text-3xl font-bold">Instantiate Area</h2>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Define Physical Boundaries</p>
                 </div>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-3 block">Area Name</label>
                  <input 
                    required 
                    autoFocus 
                    placeholder="e.g. Main Hall" 
                    value={newSectionData.name} 
                    onChange={e => {
                      const name = e.target.value;
                      const prefix = name.trim().charAt(0).toUpperCase();
                      setNewSectionData({ ...newSectionData, name, prefix });
                    }} 
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white text-xl outline-none focus:border-gold-500 transition-all placeholder-slate-800 shadow-inner" 
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                   <div>
                     <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-3 block">Area Prefix (Short)</label>
                     <div className="relative">
                       <input 
                         required 
                         maxLength={2}
                         placeholder="e.g. M" 
                         value={newSectionData.prefix} 
                         onChange={e => setNewSectionData({...newSectionData, prefix: e.target.value.toUpperCase()})} 
                         className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 pl-14 text-white font-mono font-bold uppercase outline-none focus:border-gold-500 transition-all shadow-inner" 
                       />
                       <Hash className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700" size={20} />
                     </div>
                   </div>
                   <div>
                     <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-3 block">Total Guest Limit</label>
                     <div className="relative">
                       <input 
                         required 
                         type="number"
                         value={newSectionData.totalCapacity} 
                         onChange={e => setNewSectionData({...newSectionData, totalCapacity: parseInt(e.target.value) || 0})} 
                         className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 pl-14 text-white font-mono font-bold outline-none focus:border-gold-500 transition-all shadow-inner" 
                       />
                       <Maximize className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700" size={20} />
                     </div>
                   </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                 <button type="button" onClick={() => setIsSectionModalOpen(false)} className="flex-1 py-5 text-slate-500 font-black uppercase text-xs hover:text-white transition-colors">Cancel</button>
                 <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-[2] py-5 bg-gold-500 hover:bg-gold-400 text-black font-black uppercase text-sm rounded-2xl shadow-2xl shadow-gold-500/10 transition-all transform active:scale-95"
                 >
                   {isSaving ? <Loader2 size={24} className="animate-spin mx-auto" /> : 'Confirm Area'}
                 </button>
              </div>
           </form>
         </div>
       )}

       {/* MODAL: EDIT AREA */}
       {isEditModalOpen && editSectionData && (
         <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
           <form onSubmit={handleUpdateSection} className="bg-slate-900 p-10 rounded-[3rem] w-full max-w-lg border border-slate-700 space-y-8 shadow-2xl animate-in zoom-in duration-300">
              <div className="flex items-center gap-4">
                 <div className="p-4 bg-gold-500 rounded-[1.5rem] text-black shadow-xl shadow-gold-500/20">
                    <Settings2 size={32} />
                 </div>
                 <div>
                    <h2 className="text-white font-serif text-3xl font-bold">Edit Area</h2>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Adjust Boundaries & Capacity</p>
                 </div>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-3 block">Area Name</label>
                  <input 
                    required 
                    value={editSectionData.name} 
                    onChange={e => setEditSectionData({...editSectionData, name: e.target.value})} 
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-white text-xl outline-none focus:border-gold-500 transition-all shadow-inner" 
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                   <div>
                     <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-3 block">Area Prefix</label>
                     <div className="relative">
                       <input 
                         required 
                         maxLength={2}
                         value={editSectionData.prefix} 
                         onChange={e => setEditSectionData({...editSectionData, prefix: e.target.value.toUpperCase()})} 
                         className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 pl-14 text-white font-mono font-bold uppercase outline-none focus:border-gold-500 transition-all shadow-inner" 
                       />
                       <Hash className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700" size={20} />
                     </div>
                   </div>
                   <div>
                     <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-3 block">Total Guest Limit</label>
                     <div className="relative">
                       <input 
                         required 
                         type="number"
                         value={editSectionData.totalCapacity} 
                         onChange={e => setEditSectionData({...editSectionData, totalCapacity: parseInt(e.target.value) || 0})} 
                         className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 pl-14 text-white font-mono font-bold outline-none focus:border-gold-500 transition-all shadow-inner" 
                       />
                       <Maximize className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700" size={20} />
                     </div>
                   </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                 <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 py-5 text-slate-500 font-black uppercase text-xs hover:text-white transition-colors">Cancel</button>
                 <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-[2] py-5 bg-gold-500 hover:bg-gold-400 text-black font-black uppercase text-sm rounded-2xl shadow-2xl shadow-gold-500/10 transition-all transform active:scale-95 flex items-center justify-center gap-2"
                 >
                   {isSaving ? <Loader2 size={24} className="animate-spin" /> : <><Save size={20}/> Update Area</>}
                 </button>
              </div>
           </form>
         </div>
       )}

       {/* WIPE CONFIRMATION MODAL */}
       {confirmWipeId && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
             <div className="bg-slate-900 border border-red-500/30 p-10 rounded-[3rem] w-full max-w-md space-y-8 animate-in zoom-in duration-300">
                <div className="flex flex-col items-center text-center space-y-4">
                   <div className="p-5 bg-red-600 rounded-[2rem] text-white shadow-2xl shadow-red-600/20">
                      <AlertTriangle size={48}/>
                   </div>
                   <div>
                      <h2 className="text-white font-serif text-3xl font-bold">Dissolve Area?</h2>
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">All furniture and configuration will be wiped.</p>
                   </div>
                </div>
                <div className="flex gap-3 pt-4">
                   <button onClick={() => setConfirmWipeId(null)} className="flex-1 py-5 bg-slate-800 text-slate-400 rounded-2xl font-black uppercase text-xs">Abort</button>
                   <button onClick={handleWipeSection} disabled={isSaving} className="flex-1 py-5 bg-red-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-red-900/50">
                      {isSaving ? <Loader2 className="animate-spin mx-auto"/> : 'Final Wipe'}
                   </button>
                </div>
             </div>
          </div>
       )}
    </div>
  );
};
