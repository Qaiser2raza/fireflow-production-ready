declare module '@google/genai' {
  export class GoogleGenAI {
    constructor(options?: any);
    models?: any;
    generate?: (...args: any[]) => Promise<any>;
  }
  export default GoogleGenAI;
}

// Electron IPC for device pairing token storage
declare global {
  interface Window {
    electron?: {
      store?: {
        set: (key: string, value: any) => Promise<void>;
        get: (key: string) => Promise<any>;
        delete: (key: string) => Promise<void>;
      };
    };
  }
}
