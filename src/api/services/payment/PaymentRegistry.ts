import { PaymentProvider } from './PaymentTypes';

export class PaymentRegistry {
  private static instance: PaymentRegistry | null = null;
  private readonly providers: Map<string, PaymentProvider> = new Map();

  private constructor() {}

  static getInstance(): PaymentRegistry {
    if (!PaymentRegistry.instance) {
      PaymentRegistry.instance = new PaymentRegistry();
    }
    return PaymentRegistry.instance;
  }

  register(provider: PaymentProvider): void {
    const existing = this.providers.get(provider.type);
    if (existing) {
      throw new Error(`Payment provider type already registered: ${provider.type}`);
    }
    this.providers.set(provider.type, provider);
  }

  get(type: string): PaymentProvider | undefined {
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
