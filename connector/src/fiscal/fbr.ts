import { RegionalFiscalProvider, ProviderIssueRequest, RegionalFiscalResult } from './provider';

export class FbrFiscalProvider implements RegionalFiscalProvider {
  readonly type = 'FBR_IMS';
  readonly version = '1.0.0';
  readonly capabilities: readonly string[] = ['INVOICE'];

  async issue(request: ProviderIssueRequest): Promise<RegionalFiscalResult> {
    return {
      outcome: 'UNKNOWN',
      errorCode: 'FBR_UNVERIFIED',
      errorMessage: 'FBR IMS behavior not yet verified. Adapter returns UNKNOWN until provider facts are confirmed.',
    };
  }
}
