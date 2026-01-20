import { useState, useEffect } from 'react';

/**
 * Debounce hook - delays updating value until user stops typing
 * Prevents excessive API calls and improves performance
 * 
 * @param value - The value to debounce (e.g. search query, phone number)
 * @param delay - Delay in milliseconds (default 500ms)
 * @returns The debounced value
 * 
 * @example
 * const searchQuery = 'hello';
 * const debouncedQuery = useDebounce(searchQuery, 300);
 * // debouncedQuery updates 300ms after searchQuery stops changing
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set timeout to update debounced value after delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup function: cancel timeout if value changes before delay completes
    // This is the "debounce" magic - resets the timer on every keystroke
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}