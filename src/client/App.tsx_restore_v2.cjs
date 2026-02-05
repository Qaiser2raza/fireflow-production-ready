import React, { createContext, useContext, useState, useEffect } from 'react';
import { Staff, Order, Table, Section, MenuItem, MenuCategory, AppContextType, Notification, OrderItem, OrderType, OrderStatus, TableStatus, PaymentBreakdown, Customer, Vendor, Station, ItemStatus } from '../shared/types';
import { Layout, Grid, LogOut, Settings, Users, Coffee, Bike, ShoppingBag, CreditCard, Utensils, Shield, RefreshCw } from 'lucide-react';

// --- COMPONENT IMPORTS ---
import { LoginPage as LoginView } from '../auth/views/LoginPage';
import { POSView } from '../operations/pos/POSView';
import { ActivityLog } from '../operations/activity/ActivityLog';
import { FloorManagementView as OrderCommandHub } from '../operations/dashboard/FloorManagementView';
import { KDSView } from '../operations/kds/KDSView';
import { LogisticsHub } from '../operations/logistics/LogisticsHub';
import { SuperAdminView } from '../features/saas-hq/SuperAdminView';
import { MenuView } from '../operations/menu/MenuView';
import { DashboardView } from '../operations/dashboard/DashboardView';
import { TransactionsView } from '../operations/transactions/TransactionsView';
import { StaffView } from '../features/settings/StaffView';
import { SettingsView } from '../features/settings/SettingsView';

// Services
import { tableService } from '../shared/lib/tableService';
import { socketIO } from '../shared/lib/socketClient';

// --- 1. CONTEXT DEFINITION ---
const AppContext = createContext < AppContextType | undefined > (undefined);
