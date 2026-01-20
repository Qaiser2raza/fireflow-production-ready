
import { MenuItem, Order, OrderStatus, Section, Server, Table, TableStatus, Reservation } from './types';

export const MENU_ITEMS: MenuItem[] = [
  {
    id: '0e2a17f7-8007-41d7-92aa-8be7c8b74893',
    name: 'Seekh Kebab',
    nameUrdu: 'سیخ کباب',
    price: 1200,
    category: 'starters',
    station: 'hot',
    image: 'https://images.unsplash.com/photo-1606471191009-63994c53433b?auto=format&fit=crop&w=800&q=80',
    available: true,
    pricingStrategy: 'unit'
  },
  {
    id: '385f8254-2ce9-432c-bdd1-07175f5fa9c9',
    name: 'Chicken Karahi 500g',
    nameUrdu: 'Chicken Karahi 500g',
    price: 1900,
    category: 'mains',
    station: 'hot',
    image: 'https://images.unsplash.com/photo-1512058560366-cd242d4586ee?auto=format&fit=crop&w=800&q=80',
    available: true,
    pricingStrategy: 'unit'
  },
  {
    id: '50c7ff96-717d-4ff3-8e04-80598e44875a',
    name: 'Chicken Karahi',
    nameUrdu: 'چکن کڑاہی',
    price: 1800,
    category: 'mains',
    station: 'hot',
    image: 'https://images.unsplash.com/photo-1603496987351-f12a3bc2a553?auto=format&fit=crop&w=800&q=80',
    available: true,
    pricingStrategy: 'unit'
  },
  {
    id: '5b2e4cd8-b306-4514-b1cd-da695f0c7dc9',
    name: 'Chicken Handi 1Kg',
    nameUrdu: 'چکن ہانڈی 1 کلو',
    price: 2100,
    category: 'mains',
    station: 'hot',
    image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTI9r9aS4hgf47gYscWMvh-M0RmNo_RfIb4fA&s',
    available: true,
    pricingStrategy: 'unit'
  },
  {
    id: '6c9b2119-68d8-49ac-9443-a464783ff37b',
    name: 'Gulab Jamun',
    nameUrdu: 'گلاب جامن',
    price: 600,
    category: 'desserts',
    station: 'dessert',
    image: 'https://images.unsplash.com/photo-1593701461250-d7162f1dd35c?auto=format&fit=crop&w=800&q=80',
    available: true,
    pricingStrategy: 'unit'
  },
  {
    id: '77fbb37b-fc91-4c5b-bc85-2be8607a3314',
    name: 'Garlic Naan',
    nameUrdu: 'گارلک نان',
    price: 150,
    category: 'starters',
    station: 'tandoor',
    image: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=800&q=80',
    available: true,
    pricingStrategy: 'fixed_per_head'
  },
  {
    id: '8af18b9d-3f84-4438-aca8-82fffff8dcec',
    name: 'Chicken Handi',
    nameUrdu: 'چکن ہانڈی',
    price: 1800,
    category: 'mains',
    station: 'hot',
    image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQTqnIMxMC_q194YtO82KzvIQBU8839ahhXcA&s',
    available: true,
    pricingStrategy: 'unit'
  },
  {
    id: 'a8914672-e39f-4694-8e0b-dc304db7893d',
    name: 'Mutton Handi',
    nameUrdu: 'مٹن ہانڈی',
    price: 2400,
    category: 'mains',
    station: 'hot',
    image: 'https://images.unsplash.com/photo-1585937421612-70a008356f36?auto=format&fit=crop&w=800&q=80',
    available: true,
    pricingStrategy: 'unit'
  },
  {
    id: 'dd6b9e8e-0134-468d-8e2b-2a583ac1a94c',
    name: 'Mint Lemonade',
    nameUrdu: 'پودینہ لیمونیڈ',
    price: 450,
    category: 'beverages',
    station: 'bar',
    image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=800&q=80',
    available: true,
    pricingStrategy: 'unit'
  }
];

export const INITIAL_ORDERS: Order[] = [];

export const INITIAL_SECTIONS: Section[] = [
  { id: 'SEC-1', name: 'Main Hall', prefix: 'MH', totalCapacity: 50, isFamilyOnly: false, type: 'DINING' },
  { id: 'SEC-2', name: 'Family Hall', prefix: 'FH', totalCapacity: 30, isFamilyOnly: true, type: 'DINING' },
  { id: 'SEC-3', name: 'Patio', prefix: 'P', totalCapacity: 40, isFamilyOnly: false, type: 'DINING' },
];

export const INITIAL_SERVERS: Server[] = [
  { id: 'S-TEMP-1', name: 'Staff Member 1', role: 'WAITER', pin: '1111', active_tables: 0 },
  { id: 'S-TEMP-2', name: 'Staff Member 2', role: 'CASHIER', pin: '2222', active_tables: 0 },
  { 
    id: 'SUPER-ADMIN-1', 
    name: 'System Admin', 
    role: 'SUPER_ADMIN', 
    pin: '9999', 
    active_tables: 0,
    restaurant_id: undefined
  }
];

export const INITIAL_TABLES: Table[] = [
  { id: 'TB-1', name: 'MH-1', sectionId: 'SEC-1', capacity: 2, status: TableStatus.AVAILABLE, last_status_change: new Date() },
  { id: 'TB-2', name: 'MH-2', sectionId: 'SEC-1', capacity: 4, status: TableStatus.AVAILABLE, last_status_change: new Date() },
  { id: 'TB-3', name: 'MH-3', sectionId: 'SEC-1', capacity: 6, status: TableStatus.AVAILABLE, last_status_change: new Date() },
  { id: 'TB-4', name: 'FH-1', sectionId: 'SEC-2', capacity: 6, status: TableStatus.AVAILABLE, last_status_change: new Date() },
];

export const INITIAL_RESERVATIONS: Reservation[] = [];
