import { FireFlowConnector } from './IntegrationTypes';

export class IntegrationRegistry {
  private static instance: IntegrationRegistry | null = null;
  private readonly connectors: Map<string, FireFlowConnector> = new Map();

  private constructor() {}

  static getInstance(): IntegrationRegistry {
    if (!IntegrationRegistry.instance) {
      IntegrationRegistry.instance = new IntegrationRegistry();
    }
    return IntegrationRegistry.instance;
  }

  register(connector: FireFlowConnector): void {
    const existing = this.connectors.get(connector.type);
    if (existing) {
      throw new Error(`Connector type already registered: ${connector.type}`);
    }
    this.connectors.set(connector.type, connector);
  }

  get(type: string): FireFlowConnector | undefined {
    return this.connectors.get(type);
  }

  has(type: string): boolean {
    return this.connectors.has(type);
  }

  list(): Array<{ type: string; version: string; capabilities: readonly string[] }> {
    return Array.from(this.connectors.values()).map((c) => ({
      type: c.type,
      version: c.version,
      capabilities: c.capabilities,
    }));
  }

  clear(): void {
    this.connectors.clear();
  }
}
