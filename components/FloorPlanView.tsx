
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../App';
import { Table, Section, TableStatus, Server, Order, OrderStatus, Reservation } from '../types';
import { Users, Clock, Utensils, AlertCircle, RefreshCw, X, User as UserIcon, Check, Minus, Plus, Lock, AlertTriangle, Maximize, Loader2, Trash2, ChefHat, Receipt, Ghost, LogIn, Activity } from 'lucide-react';

export const FloorPlanView: React.FC = () => {
  const { tables, sections, servers, updateTableStatus, setActiveView, setOrderToEdit, orders, reservations, updateReservationStatus } = useAppContext();
  const [activeSectionId, setActiveSectionId] = useState<string>('');

  const uniqueSections = useMemo(() => {
    const seen = new Set();
    return sections.filter(s => {
      const duplicate = seen.has(s.id);
      seen.add(s.id);
      return !duplicate;
    });
  }, [sections]);

  useEffect(() => {
    if (uniqueSections.length > 0 && (!activeSectionId || !uniqueSections.find(s => s.id === activeSectionId))) {
      setActiveSectionId(uniqueSections[0].id);
    }
  }, [uniqueSections, activeSectionId]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000); 
    return () => clearInterval(timer);
  }, []);

  const activeSection = uniqueSections.find(s => s.id === activeSectionId);
  const currentTables = tables.filter(t => t.sectionId === activeSectionId);
  
  const seatedGuests = orders
    .filter(o => !['PAID', 'CANCELLED', 'VOID'].includes(o.status))
    .filter(o => o.type === 'dine-in' && currentTables.some(t => t.id === o.tableId || t.name === o.tableId))
    .reduce((sum, o) => sum + (o.guestCount || 0), 0);

  const totalCapacity = activeSection?.totalCapacity || 1;
  const occupancyRate = Math.round((seatedGuests / totalCapacity) * 100);

  const handleTableClick = (table: Table) => {
    setSelectedTable(table);
  };

  const getTableStatusWithReservation = (table: Table) => {
    const now = new Date();
    const reservation = reservations.find(r => 
      r.assignedTableId === table.id && 
      r.status === 'confirmed' &&
      r.reservationTime.getTime() > now.getTime() - (1000 * 60 * 15)
    );

    let isWarning = false;
    let isReservedNow = false;

    if (reservation && table.status === TableStatus.AVAILABLE) {
       const resTime = reservation.reservationTime.getTime();
       const bufferStart = resTime - (reservation.bufferMinutes * 60000);
       if (now.getTime() >= bufferStart && now.getTime() < resTime) isWarning = true;
       else if (now.getTime() >= resTime && now.getTime() < resTime + (reservation.durationMinutes * 60000)) isReservedNow = true;
    }
    return { isWarning, isReservedNow, reservation };
  };

  const getStatusColor = (table: Table, isReserved: boolean, isWarning: boolean) => {
    const activeOrder = orders.find(o => (o.tableId === table.id || o.tableId === table.name) && !['PAID', 'CANCELLED', 'VOID'].includes(o.status));
    const isJustSeated = table.status === TableStatus.OCCUPIED && !activeOrder;

    if (isReserved) return 'border-blue-500 bg-blue-900/10 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]';
    if (isWarning) return 'border-yellow-500 bg-slate-900 text-yellow-400';
    if (isJustSeated) return 'border-cyan-500 bg-cyan-900/10 text-cyan-400 animate-pulse';

    switch (table.status) {
      case TableStatus.AVAILABLE: return 'border-slate-800 bg-slate-900 text-slate-500';
      case TableStatus.OCCUPIED: return 'border-green-500 bg-green-900/10 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.1)]';
      case TableStatus.PAYMENT_PENDING: return 'border-yellow-500 bg-yellow-900/10 text-yellow-500 animate-pulse';
      case TableStatus.DIRTY: return 'border-red-500 bg-red-900/10 text-red-400';
      default: return 'border-slate-700';
    }
  };

  const handleNavigateToPOS = (table: Table, guestCount: number, existingOrderId?: string, assignedWaiterId?: string) => {
    if (existingOrderId) {
      const existingOrder = orders.find(o => o.id === existingOrderId);
      if (existingOrder) {
        setOrderToEdit(existingOrder);
      }
    } else {
      const newOrderShell: Order = {
        id: 'NEW_FROM_FLOOR',
        status: OrderStatus.DRAFT,
        timestamp: new Date(),
        type: 'dine-in',
        total: 0,
        items: [],
        tableId: table.id, 
        guestCount: guestCount,
        assignedWaiterId: assignedWaiterId || servers.find(s => s.role === 'WAITER')?.id
      };
      setOrderToEdit(newOrderShell);
    }
    setActiveView('pos');
    setSelectedTable(null);
  };

  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col">
      <div className="h-24 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-8 shrink-0 z-10">
        <div className="flex gap-1 h-full items-center overflow-x-auto no-scrollbar">
          {uniqueSections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSectionId(section.id)}
              className={`px-8 h-full text-[11px] font-black uppercase tracking-[0.2em] transition-all border-b-2 whitespace-nowrap
                ${activeSectionId === section.id 
                  ? 'border-gold-500 text-gold-500 bg-gold-500/5' 
                  : 'border-transparent text-slate-500 hover:text-slate-300'}
              `}
            >
              {section.name}
            </button>
          ))}
        </div>
        
        <div className="flex gap-10 items-center">
           <div className="space-y-2 w-48 hidden lg:block">
              <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-500">
                 <span>Saturation</span>
                 <span>{occupancyRate}%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
                 <div 
                    className={`h-full transition-all duration-1000 ${occupancyRate > 90 ? 'bg-red-500' : 'bg-gold-500'}`} 
                    style={{width: `${Math.min(100, occupancyRate)}%`}} 
                 />
              </div>
           </div>
           <div className="text-right">
             <div className="text-3xl font-mono text-white font-bold tracking-tight">{seatedGuests} / {totalCapacity}</div>
             <div className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-black">Live Heads</div>
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-8">
          {currentTables.map(table => {
            const server = servers.find(s => s.id === table.serverId);
            const elapsed = Math.floor((Date.now() - new Date(table.lastStatusChange).getTime()) / 60000);
            const activeOrder = orders.find(o => (o.tableId === table.id || o.tableId === table.name) && !['PAID', 'CANCELLED', 'VOID'].includes(o.status));
            
            // PRODUCTION STATUS CALCULATION (Refactored to remove illegal useMemo call)
            let productionProgress = 0;
            if (activeOrder && activeOrder.items.length > 0) {
               const readyItems = activeOrder.items.filter(i => i.status === OrderStatus.READY).length;
               productionProgress = Math.round((readyItems / activeOrder.items.length) * 100);
            }

            const { isWarning, isReservedNow } = getTableStatusWithReservation(table);
            const isJustSeated = table.status === TableStatus.OCCUPIED && !activeOrder;

            return (
              <div 
                key={table.id}
                onClick={() => handleTableClick(table)}
                className={`h-56 rounded-[2.5rem] border-4 flex flex-col p-6 relative cursor-pointer transition-all hover:scale-[1.05] hover:z-20 shadow-2xl
                  ${getStatusColor(table, isReservedNow, isWarning)}
                `}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-3xl font-serif font-bold tracking-tight">{table.name}</span>
                  <div className="flex gap-1">
                    {activeOrder && activeOrder.status !== OrderStatus.DRAFT && <ChefHat size={16} className={`${productionProgress === 100 ? 'text-green-500' : 'text-yellow-500 animate-bounce'}`} />}
                    {table.status === TableStatus.PAYMENT_PENDING && <Receipt size={16} className="text-yellow-500 animate-bounce" />}
                    {isJustSeated && <div className="bg-cyan-600 text-white px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><Users size={10}/> Seated</div>}
                  </div>
                </div>

                <div className="mb-2">
                  {isReservedNow ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg bg-blue-900/50 text-blue-300 border border-blue-500/30 flex items-center gap-1 w-fit">
                       <Lock size={10} /> Reserved
                    </span>
                  ) : isWarning ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg bg-yellow-900/50 text-yellow-500 border border-yellow-500/30 flex items-center gap-1 w-fit">
                       <AlertCircle size={10} /> Soon
                    </span>
                  ) : (
                    <div className="flex items-center gap-1 text-[9px] text-slate-500 font-black uppercase tracking-widest">
                       <Users size={12}/> {activeOrder?.guestCount || table.capacity}p Limit
                    </div>
                  )}
                </div>

                {/* NEURAL PRODUCTION PROGRESS */}
                {activeOrder && activeOrder.status !== OrderStatus.DRAFT && (
                   <div className="mt-2 space-y-1">
                      <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-slate-400">
                         <span>Production Pulse</span>
                         <span>{productionProgress}%</span>
                      </div>
                      <div className="h-1 w-full bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
                         <div 
                            className={`h-full transition-all duration-700 ease-out ${productionProgress === 100 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-gold-500 animate-pulse'}`}
                            style={{ width: `${productionProgress}%` }}
                         />
                      </div>
                   </div>
                )}

                <div className="mt-auto space-y-3">
                  {table.status !== TableStatus.AVAILABLE && !isJustSeated ? (
                     <div className="flex justify-between items-end border-t border-slate-800/50 pt-3">
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-full bg-gold-500 text-black flex items-center justify-center text-[10px] font-black">
                              {server?.name.charAt(0) || '?'}
                           </div>
                           <span className="text-[10px] text-white font-bold">{server?.name.split(' ')[0]}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-gold-500 font-mono font-bold">
                           <cite><Clock size={10}/></cite> {elapsed}m
                        </div>
                     </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[10px] text-slate-600 font-black uppercase tracking-widest italic border-t border-slate-800/50 pt-3">
                       {table.status.replace('_', ' ')}
                    </div>
                  )}
                </div>

                {table.status === TableStatus.DIRTY && (
                  <div className="absolute inset-0 bg-red-950/40 flex items-center justify-center backdrop-blur-[2px] rounded-[2.2rem] animate-in fade-in">
                    <div className="bg-red-600 text-white px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl flex items-center gap-2">
                      <RefreshCw size={14} className="animate-spin" /> Dirty
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedTable && (
        <TableDetailModal 
          table={selectedTable} 
          servers={servers}
          reservations={reservations}
          activeOrder={orders.find(o => (o.tableId === selectedTable.id || o.tableId === selectedTable.name) && !['PAID', 'CANCELLED', 'VOID'].includes(o.status))}
          onClose={() => setSelectedTable(null)}
          onUpdateStatus={updateTableStatus}
          onUpdateReservation={updateReservationStatus}
          onGoToPOS={(guestCount, orderId, waiterId) => handleNavigateToPOS(selectedTable, guestCount, orderId, waiterId)}
        />
      )}
    </div>
  );
};

interface ModalProps {
  table: Table;
  servers: Server[];
  reservations: Reservation[];
  activeOrder?: Order;
  onClose: () => void;
  onUpdateStatus: (id: string, status: TableStatus, serverId?: string, activeOrderId?: string) => Promise<boolean>;
  onUpdateReservation: (id: string, status: Reservation['status']) => void;
  onGoToPOS: (guestCount: number, orderId?: string, assignedWaiterId?: string) => void;
}

const TableDetailModal: React.FC<ModalProps> = ({ table, servers, reservations, activeOrder, onClose, onUpdateStatus, onUpdateReservation, onGoToPOS }) => {
  const { currentUser } = useAppContext();
  const [guestCount, setGuestCount] = useState<number>(activeOrder?.guestCount || table.capacity); 
  const [selectedWaiterId, setSelectedWaiterId] = useState<string>(activeOrder?.assignedWaiterId || table.serverId || currentUser?.id || '');
  const [isUpdating, setIsUpdating] = useState(false);
  
  const isSqueezed = guestCount > table.capacity;
  const isJustSeated = table.status === TableStatus.OCCUPIED && !activeOrder;

  const handleSeatAction = async () => {
    setIsUpdating(true);
    const success = await onUpdateStatus(table.id, TableStatus.OCCUPIED, selectedWaiterId, undefined);
    if (success) {
      onClose();
    }
    setIsUpdating(false);
  };

  const handleOrderAction = () => {
    onGoToPOS(guestCount, activeOrder?.id, selectedWaiterId);
  };

  const handleStatusChange = async (status: TableStatus) => {
    setIsUpdating(true);
    const success = await onUpdateStatus(table.id, status, undefined, undefined);
    if (success) onClose();
    setIsUpdating(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-[3rem] shadow-2xl flex flex-col overflow-hidden relative">
        <button disabled={isUpdating} onClick={onClose} className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors">
          <X size={32} />
        </button>

        <div className="p-10 border-b border-slate-800 bg-slate-950 text-center">
           <div className="inline-block px-4 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-500 text-[10px] font-black uppercase tracking-[0.3em] mb-4">Furniture Unit</div>
           <h2 className="text-white font-serif text-5xl font-bold mb-1">{table.name}</h2>
           {activeOrder && <div className="text-gold-500 font-bold uppercase text-[10px] tracking-widest mt-2">{activeOrder.status} SESSION</div>}
           {isJustSeated && <div className="text-cyan-500 font-bold uppercase text-[10px] tracking-widest mt-2">GUESTS WAITING TO ORDER</div>}
        </div>

        <div className="p-10 space-y-8 bg-slate-900">
           {table.status === TableStatus.AVAILABLE && (
             <div className="space-y-6">
                <div className="flex justify-between items-end">
                   <label className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Heads for Seating</label>
                   {isSqueezed && (
                      <div className="flex items-center gap-2 text-orange-500 animate-pulse">
                         <AlertTriangle size={14}/>
                         <span className="text-[9px] font-black uppercase">Expansion (+{guestCount - table.capacity})</span>
                      </div>
                   )}
                </div>
                <div className="flex items-center justify-between bg-slate-950 p-6 rounded-[2rem] border border-slate-800 shadow-inner">
                  <button onClick={() => setGuestCount(Math.max(1, guestCount - 1))} className="w-16 h-16 bg-slate-900 border border-slate-700 rounded-2xl flex items-center justify-center hover:bg-slate-800 text-white transition-all"><Minus size={24} /></button>
                  <div className="text-center">
                     <span className={`text-6xl font-serif font-bold ${isSqueezed ? 'text-orange-500' : 'text-white'}`}>{guestCount}</span>
                  </div>
                  <button onClick={() => setGuestCount(guestCount + 1)} className="w-16 h-16 bg-slate-900 border border-slate-700 rounded-2xl flex items-center justify-center hover:bg-slate-800 text-white transition-all"><Plus size={24} /></button>
                </div>
             </div>
           )}

           <div className="grid grid-cols-1 gap-4 pt-4">
               {table.status === TableStatus.AVAILABLE && (
                  <button 
                    disabled={isUpdating}
                    onClick={handleSeatAction}
                    className={`h-20 rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-sm flex items-center justify-center gap-4 shadow-2xl transition-all active:scale-95
                       ${isSqueezed ? 'bg-orange-600 text-white' : 'bg-green-600 text-white shadow-green-500/20 hover:bg-green-500'}
                    `}
                  >
                    {isUpdating ? <Loader2 className="animate-spin" /> : <><LogIn size={24} /> {isSqueezed ? 'Force Squeeze' : 'Seat Guests'}</>}
                  </button>
               )}

               {(table.status === TableStatus.OCCUPIED || table.status === TableStatus.PAYMENT_PENDING) && (
                  <button 
                    disabled={isUpdating}
                    onClick={handleOrderAction}
                    className="h-20 bg-gold-500 hover:bg-gold-400 text-black rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-sm flex items-center justify-center gap-4 shadow-2xl shadow-gold-500/20"
                  >
                    <Utensils size={24} /> {activeOrder ? 'Update Ticket / Bill' : 'Take First Order'}
                  </button>
               )}

               {table.status === TableStatus.DIRTY && (
                  <button 
                    disabled={isUpdating}
                    onClick={() => handleStatusChange(TableStatus.AVAILABLE)}
                    className="h-20 bg-white hover:bg-slate-100 text-black rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-sm flex items-center justify-center gap-4"
                  >
                    {isUpdating ? <Loader2 className="animate-spin" /> : <Check size={24} />} Ready for New Guests
                  </button>
               )}
           </div>

           {table.status !== TableStatus.AVAILABLE && (
              <div className="flex gap-4 justify-center">
                 <button disabled={isUpdating} onClick={() => handleStatusChange(TableStatus.DIRTY)} className="text-[10px] text-red-500 font-black uppercase tracking-widest hover:text-red-400">Mark Dirty</button>
                 <div className="w-px h-4 bg-slate-800" />
                 <button disabled={isUpdating} onClick={() => handleStatusChange(TableStatus.AVAILABLE)} className="text-[10px] text-slate-500 font-black uppercase tracking-widest hover:text-white">Manual Reset</button>
              </div>
           )}
        </div>
      </div>
    </div>
  );
};
