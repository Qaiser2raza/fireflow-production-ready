import React, { useState, useMemo, useEffect } from 'react';
import { MenuItem, OrderItem, OrderStatus, OrderType, Order, TableStatus } from '../../shared/types';
import { useAppContext } from '../../client/App';
import { Search, Flame, Utensils, ShoppingBag, X, Edit2, History, Plus, Minus, Receipt, Loader2, Printer } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';

const generateSensibleId = () => {
  const now = new Date();
  const timePart = now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  const randomPart = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ORD-${timePart}-${randomPart}`;
};

export const POSView: React.FC = () => {
  const {
    addOrder, updateOrder, updateTableStatus, calculateOrderTotal, orders,
    orderToEdit, setOrderToEdit, currentUser, menuItems,
    tables, addNotification, customers, updateCustomer 
  } = useAppContext();

  // UI & Order State
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [currentOrderItems, setCurrentOrderItems] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [guestCount, setGuestCount] = useState<number>(2);
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [isCustomerLoading, setIsCustomerLoading] = useState(false);

  const debouncedPhone = useDebounce(customerPhone, 400);

  // Customer Lookup logic
  useEffect(() => {
    const cleanPhone = debouncedPhone.replace(/\D/g, '');
    if (cleanPhone.length >= 10 && (orderType === 'TAKEAWAY' || orderType === 'DELIVERY')) {
      setIsCustomerLoading(true);
      const match = customers?.find(c => (c.phone || '').replace(/\D/g, '') === cleanPhone);
      if (match) {
        setCustomerName(match.name || '');
        setDeliveryAddress(match.address || '');
        addNotification('success', `✓ Customer Found: ${match.name}`);
      } else {
        setCustomerName('');
        setDeliveryAddress('');
      }
      setIsCustomerLoading(false);
    } else if (cleanPhone.length === 0) {
      setCustomerName('');
      setDeliveryAddress('');
    }
  }, [debouncedPhone, orderType, customers, addNotification]);

  const activeTable = useMemo(() => tables.find(t => t.id === selectedTableId), [tables, selectedTableId]);

  const breakdown = useMemo(() => {
    const defaultBreakdown = { subtotal: 0, serviceCharge: 0, tax: 0, deliveryFee: 0, discount: 0, total: 0 };
    if (typeof calculateOrderTotal !== 'function') return defaultBreakdown;
    return calculateOrderTotal(currentOrderItems, orderType, guestCount, 250) || defaultBreakdown;
  }, [currentOrderItems, orderType, guestCount, calculateOrderTotal]);

  const hasDraftItems = currentOrderItems.some(i => i.status === OrderStatus.DRAFT);
  const activeOrderData = activeOrderId ? orders.find(o => o.id === activeOrderId) : null;
  const isAlreadyPaid = activeOrderData?.status === OrderStatus.PAID;

  const filteredItems = useMemo(() => {
    let items = menuItems || [];
    if (activeCategory !== 'all') items = items.filter(i => i.category === activeCategory);
    const safeQuery = searchQuery.toLowerCase();
    if (safeQuery) items = items.filter(i => i.name.toLowerCase().includes(safeQuery));
    return items;
  }, [activeCategory, searchQuery, menuItems]);

  const resetPad = () => {
    setActiveOrderId(null);
    setCurrentOrderItems([]);
    setCustomerPhone('');
    setCustomerName('');
    setDeliveryAddress('');
    setOrderType(currentUser?.role === 'CASHIER' ? 'TAKEAWAY' : 'DINE_IN');
    setSelectedTableId('');
    setGuestCount(2);
    setIsSubmitting(false);
  };

  const addToOrder = (item: MenuItem) => {
    if (!item.available || isAlreadyPaid) return;
    setCurrentOrderItems(prev => {
      const existingIndex = prev.findIndex(i => i.menu_item_id === item.id && i.status === OrderStatus.DRAFT);
      if (existingIndex >= 0) {
        const newItems = [...prev];
        newItems[existingIndex] = { ...newItems[existingIndex], quantity: newItems[existingIndex].quantity + 1 };
        return newItems;
      }
      return [{
        id: crypto.randomUUID(),
        menu_item_id: item.id,
        menuItem: item,
        quantity: 1,
        status: OrderStatus.DRAFT,
        unit_price: item.price
      } as any, ...prev];
    });
  };

  const handleOrderAction = async (targetStatus: OrderStatus) => {
    if (currentOrderItems.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    const finalItems = currentOrderItems.map(item => ({
      ...item,
      status: item.status === OrderStatus.DRAFT ? OrderStatus.NEW : item.status
    }));

    const orderData = {
      id: activeOrderId || generateSensibleId(),
      status: targetStatus,
      type: orderType,
      items: finalItems,
      total: breakdown.total,
      table_id: orderType === 'DINE_IN' ? selectedTableId : undefined,
      customer_phone: customerPhone || undefined,
      customer_name: customerName || undefined,
      restaurant_id: currentUser?.restaurant_id
    };

    try {
      const success = activeOrderId ? await updateOrder(orderData) : await addOrder(orderData);
      if (success) resetPad();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col md:flex-row overflow-hidden">
      {/* MENU SIDE */}
      <div className="flex-1 p-6 flex flex-col gap-6 overflow-hidden">
        <div className="flex items-center gap-4 bg-slate-900/80 p-3 rounded-lg border border-slate-800">
          <Search className="text-slate-500" size={20} />
          <input
            type="text"
            placeholder="SEARCH MENU..."
            className="bg-transparent outline-none text-slate-300 w-full text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 overflow-y-auto">
          {filteredItems.map(item => (
            <div key={item.id} onClick={() => addToOrder(item)} className="p-4 bg-slate-900 rounded-xl cursor-pointer border border-slate-800 hover:border-gold-500 transition-all">
              <h3 className="text-white font-bold">{item.name}</h3>
              <p className="text-gold-500">Rs. {item.price}</p>
            </div>
          ))}
        </div>
      </div>

      {/* PAD SIDE */}
      <div className="md:w-96 bg-slate-900 border-l border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-white font-serif">Order Pad</h2>
          <div className="flex gap-2">
            <button onClick={() => setShowDetailsModal(true)} className="p-2 bg-slate-800 rounded text-gold-500 border border-slate-700 hover:bg-slate-700">
              <Edit2 size={16} />
            </button>
            <button onClick={resetPad} className="p-2 bg-slate-800 rounded text-slate-400 border border-slate-700 hover:bg-slate-700">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {currentOrderItems.map((item, i) => (
            <div key={i} className="flex justify-between py-2 border-b border-slate-800 text-slate-300">
              <span>{item.quantity}x {item.menuItem?.name}</span>
              <span className="font-mono">{(item.unit_price * item.quantity).toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div className="p-4 bg-slate-950 border-t border-slate-800">
          <div className="flex justify-between text-white text-xl font-bold mb-4">
            <span>Total</span>
            <span>Rs. {breakdown.total.toLocaleString()}</span>
          </div>
          <button 
            disabled={currentOrderItems.length === 0 || isSubmitting}
            onClick={() => handleOrderAction(OrderStatus.NEW)}
            className="w-full bg-orange-600 py-4 rounded-xl text-white font-black tracking-widest hover:bg-orange-500 transition-colors"
          >
            {isSubmitting ? <Loader2 className="animate-spin mx-auto" /> : 'FIRE TO KITCHEN'}
          </button>
        </div>
      </div>

      {showDetailsModal && (
        <DetailsModal 
          orderType={orderType}
          setOrderType={setOrderType}
          customerPhone={customerPhone}
          setCustomerPhone={setCustomerPhone}
          customerName={customerName}
          setCustomerName={setCustomerName}
          deliveryAddress={deliveryAddress}
          setDeliveryAddress={setDeliveryAddress}
          selectedTableId={selectedTableId}
          setSelectedTableId={setSelectedTableId}
          guestCount={guestCount}
          setGuestCount={setGuestCount}
          tables={tables}
          isCustomerLoading={isCustomerLoading}
          setShowDetailsModal={setShowDetailsModal}
        />
      )}
    </div>
  );
};

// --- EXTERNAL MODAL COMPONENT (Prevents Re-render Blur) ---

interface DetailsModalProps {
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  customerPhone: string;
  setCustomerPhone: (p: string) => void;
  customerName: string;
  setCustomerName: (n: string) => void;
  deliveryAddress: string;
  setDeliveryAddress: (a: string) => void;
  selectedTableId: string;
  setSelectedTableId: (id: string) => void;
  guestCount: number;
  setGuestCount: (c: number) => void;
  tables: any[];
  isCustomerLoading: boolean;
  setShowDetailsModal: (s: boolean) => void;
}

const DetailsModal: React.FC<DetailsModalProps> = ({
  orderType, setOrderType, customerPhone, setCustomerPhone,
  customerName, setCustomerName, deliveryAddress, setDeliveryAddress,
  selectedTableId, setSelectedTableId, guestCount, setGuestCount,
  tables, isCustomerLoading, setShowDetailsModal
}) => {
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
      <div className="bg-slate-900 p-8 rounded-3xl w-full max-w-lg border border-slate-800">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white font-bold text-xl">Session Configuration</h2>
          <X onClick={() => setShowDetailsModal(false)} className="text-slate-500 cursor-pointer" />
        </div>

        <div className="space-y-6">
          <div className="flex gap-2">
            {['DINE_IN', 'TAKEAWAY', 'DELIVERY'].map(t => (
              <button 
                key={t} 
                onClick={() => setOrderType(t as any)} 
                className={`flex-1 py-3 rounded-xl border font-bold text-xs transition-all ${orderType === t ? 'bg-gold-500 border-gold-500 text-black' : 'border-slate-800 text-slate-500 hover:border-slate-700'}`}
              >
                {t}
              </button>
            ))}
          </div>

          {orderType === 'DINE_IN' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold">Table</label>
                <select
                  className="w-full bg-black border border-slate-700 rounded-lg p-3 text-white mt-1"
                  value={selectedTableId}
                  onChange={e => setSelectedTableId(e.target.value)}
                >
                  <option value="">Select Table</option>
                  {tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold">Guests</label>
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => setGuestCount(Math.max(1, guestCount - 1))} className="p-3 bg-slate-800 rounded-lg text-white"><Minus size={16} /></button>
                  <span className="flex-1 text-center font-bold text-white text-xl">{guestCount}</span>
                  <button onClick={() => setGuestCount(guestCount + 1)} className="p-3 bg-slate-800 rounded-lg text-white"><Plus size={16} /></button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold flex justify-between">
                  Phone Number
                  {isCustomerLoading && <Loader2 size={12} className="animate-spin text-gold-500" />}
                </label>
                <input
                  autoFocus
                  className="w-full bg-black border border-slate-700 rounded-lg p-3 text-white mt-1 font-mono tracking-widest focus:border-gold-500 outline-none"
                  placeholder="03XXXXXXXXX"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  type="tel"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold">Name</label>
                <input
                  className="w-full bg-black border border-slate-700 rounded-lg p-3 text-white mt-1 focus:border-gold-500 outline-none"
                  placeholder="Guest Name"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                />
              </div>
              {orderType === 'DELIVERY' && (
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-bold">Address</label>
                  <textarea
                    className="w-full bg-black border border-slate-700 rounded-lg p-3 text-white mt-1 min-h-[80px] focus:border-gold-500 outline-none"
                    placeholder="Full Delivery Address..."
                    value={deliveryAddress}
                    onChange={e => setDeliveryAddress(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <button 
            onClick={() => setShowDetailsModal(false)} 
            className="w-full py-4 bg-white text-black rounded-xl font-black tracking-widest hover:bg-slate-200"
          >
            CONFIRM CONFIGURATION
          </button>
        </div>
      </div>
    </div>
  );
};