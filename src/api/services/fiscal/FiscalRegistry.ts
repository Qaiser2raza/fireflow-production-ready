import { FiscalProvider } from './FiscalTypes';

export class FiscalRegistry {
  private static instance: FiscalRegistry | null = null;
  private readonly providers: Map<string, FiscalProvider> = new Map();

  private constructor() {}

  static getInstance(): FiscalRegistry {
    if (!FiscalRegistry.instance) {
      FiscalRegistry.instance = new FiscalRegistry();
    }
    return FiscalRegistry.instance;
  }

  register(provider: FiscalProvider): void {
    const existing = this.providers.get(provider.type);
    if (existing) {
      throw new Error(`Fiscal provider type already registered: ${provider.type}`);
    }
    this.providers.set(provider.type, provider);
  }

  get(type: string): FiscalProvider | undefined {
    return this.providers.get(type);
  }

  has(type: string): boolean {
    return this.providers.has(type);
  }

  list(): Array<{ type: string; version: string; capabilities: readonly string[] }> {
    return Array.from(this.providers.values()).map((p) => ({
      type: p.type,
      version: p.version,
      capabilities: p.capabilities,
    }));
  }

  clear(): void {
    this.providers.clear();
  }
}
