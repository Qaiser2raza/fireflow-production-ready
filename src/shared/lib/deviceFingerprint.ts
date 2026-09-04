const DEVICE_ID_KEY = 'fireflow-device-id';

/** Existing synchronous fingerprint used by the separate licensing pairing flow. */
export function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'server-context';
  const components = [navigator.userAgent, navigator.language, `${screen.width}x${screen.height}`, new Date().getTimezoneOffset().toString()].join('|');
  let hash = 5381;
  for (let index = 0; index < components.length; index += 1) hash = (hash * 33) ^ components.charCodeAt(index);
  return (hash >>> 0).toString(16);
}

/** A SHA-256 browser-local pseudonymous identifier for staff PIN trust. */
export async function getTrustedDeviceFingerprint(): Promise<string | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  const source = [deviceId, navigator.userAgent, screen.width, screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function getDeviceName(): string {
  return navigator.userAgent.slice(0, 100);
}
