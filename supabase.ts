
import { createClient } from '@supabase/supabase-js';

// Load from environment variables (Vite uses VITE_ prefix)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://cmdcqikndkjwvoeszgzx.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZGNxaWtuZGtqd3ZvZXN6Z3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4Nzg2MTksImV4cCI6MjA4MTQ1NDYxOX0.zduhVxLwHTM84jYmNAMYoHv1pd96JZ9z0UxYLKfbWi4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Set the current restaurant context for RLS policies
 * Call this after user authentication to isolate data
 */
export const setRestaurantContext = async (restaurantId: string) => {
  // We use a custom RPC function because 'set_config' is not directly exposed
  const { error } = await supabase.rpc('set_restaurant_id', {
    id: restaurantId
  });
  
  if (error) {
    console.error('Failed to set restaurant context:', error);
  }
};

/**
 * Get current restaurant from authenticated user
 */
export const getCurrentRestaurant = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return null;
  
  // Get user's restaurant from staff table
  const { data: staff } = await supabase
    .from('staff')
    .select('restaurant_id, restaurants(*)')
    .eq('id', user.id)
    .single();
  
  return staff?.restaurants || null;
};
