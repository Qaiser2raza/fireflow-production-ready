import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if the current viewport is mobile size (<768px)
 * Uses window.matchMedia for better performance and SSR compatibility
 * Properly memoizes the result to avoid excessive re-renders
 */
export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    // Initial value - check during SSR or first render
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    // Create a media query listener for better performance
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    
    // Handler function
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    // Set initial state
    setIsMobile(mediaQuery.matches);

    // Add listener
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleMediaChange);
    }

    // Cleanup
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }
    };
  }, []);

  return isMobile;
};
