/**
 * Device Fingerprinting Utility
 * 
 * Standardizes the generation of device identity across both the main React app 
 * and the lightweight pairing landing page.
 */

export function getDeviceFingerprint(): string {
  // Gracefully handle server-side rendering (SSR) if necessary
  if (typeof window === 'undefined') return 'server-context';

  const components = [
    window.navigator.userAgent,
    window.navigator.language,
    `${window.screen.width}x${window.screen.height}`,
    new Date().getTimezoneOffset().toString(),
    (window.navigator as any).hardwareConcurrency?.toString() || '4',
    (window.navigator as any).platform || 'unknown'
  ].join('|');

  // djb2 hash algorithm - fast and reliable for simple fingerprinting
  let hash = 5381;
  for (let i = 0; i < components.length; i++) {
    hash = (hash * 33) ^ components.charCodeAt(i);
  }
  
  return (hash >>> 0).toString(16); // Return as unsigned 32-bit hex
}
