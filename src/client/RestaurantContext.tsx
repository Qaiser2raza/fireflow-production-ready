
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Restaurant } from '../shared/types';
import { supabase } from '../shared/lib/apiClient';

// ==========================================
// RESTAURANT CONTEXT TYPE
// ==========================================

interface RestaurantContextType {
  currentRestaurant: Restaurant | null;
  setCurrentRestaurant: (restaurant: Restaurant | null) => void;
  isSubscriptionActive: boolean;
  hasPendingPayment: boolean;
  refreshPendingStatus: () => Promise<void>;
  daysUntilExpiry: number;
  isLoading: boolean;
}

// ==========================================
// CREATE CONTEXT
// ==========================================

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

// ==========================================
// RESTAURANT PROVIDER COMPONENT
// ==========================================

export const RestaurantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant | null>(null);
  const [hasPendingPayment, setHasPendingPayment] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Calculate subscription status
  const isSubscriptionActive = currentRestaurant
    ? (currentRestaurant.subscriptionStatus === 'active' || currentRestaurant.subscriptionStatus === 'trial')
    : false;

  // Calculate days until expiry
  const daysUntilExpiry = currentRestaurant && currentRestaurant.subscriptionExpiresAt
    ? Math.ceil((new Date(currentRestaurant.subscriptionExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  const refreshPendingStatus = useCallback(async () => {
    // FIX: Do not query if restaurant is SYSTEM or not logged in
    if (!currentRestaurant || currentRestaurant.id === 'SYSTEM') {
      setHasPendingPayment(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('subscription_payments')
        .select('id')
        .eq('restaurant_id', currentRestaurant.id)
        .eq('status', 'pending')
        .limit(1);

      if (!error && data && data.length > 0) {
        setHasPendingPayment(true);
      } else {
        setHasPendingPayment(false);
      }
    } catch (err) {
      console.error('Error checking pending payments:', err);
    }
  }, [currentRestaurant?.id]);

  // Auto-expire check and pending payment check
  useEffect(() => {
    if (!currentRestaurant) {
      setIsLoading(false);
      return;
    }

    const initContext = async () => {
      const now = new Date();
      const expiry = new Date(currentRestaurant.subscriptionExpiresAt);

      // Check for pending payments
      await refreshPendingStatus();

      // If expired but status is still active/trial, we need to update it locally
      if (now > expiry && currentRestaurant.subscriptionStatus !== 'expired' && currentRestaurant.subscriptionStatus !== 'trial') {
        setCurrentRestaurant(prev => prev ? {
          ...prev,
          subscriptionStatus: 'expired'
        } : null);
      }

      setIsLoading(false);
    };

    initContext();
  }, [currentRestaurant?.id, refreshPendingStatus]);

  // Load restaurant from localStorage on mount (for persistence)
  useEffect(() => {
    const savedRestaurant = localStorage.getItem('currentRestaurant');
    if (savedRestaurant) {
      try {
        const parsed = JSON.parse(savedRestaurant);
        // FIXED: Validate dates before parsing
        if (parsed.trialEndsAt) {
          parsed.trialEndsAt = new Date(parsed.trialEndsAt);
          if (isNaN(parsed.trialEndsAt.getTime())) {
            console.warn('Invalid trialEndsAt date, using default');
            parsed.trialEndsAt = new Date();
          }
        }
        if (parsed.subscriptionExpiresAt) {
          parsed.subscriptionExpiresAt = new Date(parsed.subscriptionExpiresAt);
          if (isNaN(parsed.subscriptionExpiresAt.getTime())) {
            console.warn('Invalid subscriptionExpiresAt date, using default');
            parsed.subscriptionExpiresAt = new Date();
          }
        }
        if (parsed.createdAt) {
          parsed.createdAt = new Date(parsed.createdAt);
          if (isNaN(parsed.createdAt.getTime())) {
            parsed.createdAt = new Date();
          }
        }
        setCurrentRestaurant(parsed);
      } catch (error) {
        console.error('Failed to load restaurant from localStorage:', error);
        // FIXED: Clear corrupted data
        localStorage.removeItem('currentRestaurant');
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  }, []);

  // Save restaurant to localStorage when it changes
  useEffect(() => {
    if (currentRestaurant) {
      localStorage.setItem('currentRestaurant', JSON.stringify(currentRestaurant));
    } else {
      localStorage.removeItem('currentRestaurant');
    }
  }, [currentRestaurant]);

  return (
    <RestaurantContext.Provider
      value={{
        currentRestaurant,
        setCurrentRestaurant,
        isSubscriptionActive,
        hasPendingPayment,
        refreshPendingStatus,
        daysUntilExpiry,
        isLoading
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
};

export const useRestaurant = () => {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurant must be used within RestaurantProvider');
  }
  return context;
};

export const formatSubscriptionStatus = (status: Restaurant['subscriptionStatus']): string => {
  const statusMap = {
    trial: 'Trial Period',
    active: 'Active',
    expired: 'Expired',
    cancelled: 'Cancelled'
  };
  return statusMap[status] || status;
};

export const getSubscriptionStatusColor = (status: Restaurant['subscriptionStatus']): string => {
  const colorMap = {
    trial: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
    active: 'text-green-500 bg-green-500/10 border-green-500/30',
    expired: 'text-red-500 bg-red-500/10 border-red-500/30',
    cancelled: 'text-slate-500 bg-slate-500/10 border-slate-500/30'
  };
  return colorMap[status] || 'text-slate-500';
};

export const formatPlanName = (plan: Restaurant['subscriptionPlan']): string => {
  const planMap = {
    BASIC: 'Basic',
    STANDARD: 'Standard',
    PREMIUM: 'Premium'
  };
  return planMap[plan] || plan;
};

export const formatCurrency = (amount: number): string => {
  return `Rs. ${amount.toLocaleString()}`;
};
