/**
 * Bilingual User Messages (English & Urdu)
 * 
 * Maps technical error codes and status indicators to human-friendly 
 * bilingual messages to improve UX for non-technical users.
 */

export interface MessagePair {
  en: string;
  ur: string;
}

export const userMessages: Record<string, MessagePair> = {
  // --- Auth & Session ---
  'TOKEN_EXPIRED': {
    en: 'Your session has ended. Please enter your PIN again.',
    ur: 'آپ کا سیشن ختم ہو گیا۔ براہ کرم دوبارہ PIN درج کریں۔'
  },
  'INVALID_TOKEN': {
    en: 'Access denied. Please log in again.',
    ur: 'رسائی سے انکار۔ براہ کرم دوبارہ لاگ ان کریں۔'
  },
  'INVALID_PIN': {
    en: 'Wrong PIN. Please try again.',
    ur: 'غلط PIN۔ دوبارہ کوشش کریں۔'
  },

  // --- Pairing ---
  'PAIRING_EXPIRED': {
    en: 'This pairing code has expired. Please ask your manager to generate a new one.',
    ur: 'یہ پیئرنگ کوڈ ختم ہو گیا ہے۔ براہ کرم اپنے مینیجر سے نیا کوڈ بنانے کو کہیں۔'
  },
  'PAIRING_MAX_ATTEMPTS': {
    en: 'Too many failed attempts. Please generate a new code.',
    ur: 'بہت زیادہ غلط کوششیں۔ براہ کرم نیا کوڈ بنائیں۔'
  },
  'DEVICE_ALREADY_PAIRED': {
    en: 'This device is already registered with the restaurant.',
    ur: 'یہ موبائل پہلے سے ہی ریستوران کے ساتھ رجسٹرڈ ہے۔'
  },

  // --- Network & Infrastructure ---
  'SERVER_OFFLINE': {
    en: 'Cannot reach the restaurant system. Check your WiFi connection.',
    ur: 'ریستوران سسٹم سے رابطہ نہیں ہو رہا۔ اپنا WiFi چیک کریں۔'
  },
  'NETWORK_ERROR': {
    en: 'Connection lost. Your data is safe — please wait.',
    ur: 'کنکشن ٹوٹ گیا۔ آپ کا ڈیٹا محفوظ ہے — براہ کرم انتظار کریں۔'
  },
  'RECONNECTING': {
    en: 'Reconnecting...',
    ur: 'دوبارہ جڑ رہا ہے...'
  },
  'OFFLINE_SAFE': {
    en: 'Offline — data safe',
    ur: 'آف لائن — ڈیٹا محفوظ'
  },
  'LIVE_ONLINE': {
    en: 'Live',
    ur: 'آن لائن'
  },

  // --- Subscription ---
  'SUBSCRIPTION_EXPIRED': {
    en: 'Your subscription has ended. Please contact Fireflow support.',
    ur: 'آپ کی سبسکرپشن ختم ہو گئی۔ Fireflow سپورٹ سے رابطہ کریں۔'
  },

  // --- Generic ---
  'UNKNOWN_ERROR': {
    en: 'Something went wrong. Please try again or contact support.',
    ur: 'کچھ غلط ہو گیا ہے۔ براہ کرم دوبارہ کوشش کریں یا سپورٹ سے رابطہ کریں۔'
  }
};

/**
 * Get a single language message
 */
export function getMessage(code: string, lang: 'en' | 'ur' = 'en'): string {
  return userMessages[code]?.[lang] ?? userMessages[code]?.en ?? code;
}

/**
 * Get a combined bilingual message for display
 */
export function getBilingualMessage(code: string): string {
  const msg = userMessages[code];
  if (!msg) return code;
  return `${msg.en}\n${msg.ur}`;
}
