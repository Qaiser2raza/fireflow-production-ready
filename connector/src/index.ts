import express from 'express';
import { HmacVerifier, VerifiedFireFlowRequest } from './auth/hmac';
import { FbrFiscalProvider } from './fiscal/fbr';
import { ProviderIssueRequest, RegionalFiscalResult } from './fiscal/provider';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

const hmacVerifier = HmacVerifier.getInstance();
hmacVerifier.registerKey(
  process.env.FIREFLOW_KEY_ID || 'fireflow-fiscal-pk-dev',
  process.env.FIREFLOW_HMAC_SECRET || 'dev-secret-change-in-production',
  'fireflow-fiscal-pk'
);

const fbrProvider = new FbrFiscalProvider();

function verifyHmac(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const keyId = req.header('X-FireFlow-Key-Id');
  const timestamp = req.header('X-FireFlow-Timestamp');
  const nonce = req.header('X-FireFlow-Nonce');
  const requestId = req.header('X-FireFlow-Request-Id');
  const bodyHash = req.header('X-FireFlow-Body-Hash');
  const signature = req.header('X-FireFlow-Signature');
  const audience = req.header('X-FireFlow-Audience');

  if (!keyId || !timestamp || !nonce || !requestId || !bodyHash || !signature || !audience) {
    res.status(401).json({ error: 'Missing HMAC authentication headers' });
    return;
  }

  const verifiedRequest: VerifiedFireFlowRequest = {
    keyId,
    audience,
    timestamp: Number(timestamp),
    nonce,
    requestId,
    bodyHash,
    signature,
  };

  const verification = hmacVerifier.verify(verifiedRequest, req.body, signature);
  if (!verification.valid) {
    res.status(401).json({ error: `HMAC verification failed: ${verification.error}` });
    return;
  }

  next();
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'fireflow-fiscal-pk', provider: fbrProvider.type, version: fbrProvider.version });
});

app.post('/fiscal/issue', verifyHmac, async (req, res) => {
  try {
    const request = req.body as ProviderIssueRequest;
    const result: RegionalFiscalResult = await fbrProvider.issue(request);
    res.json(result);
  } catch (error: any) {
    console.error('Fiscal issue error:', error);
    res.status(500).json({
      outcome: 'UNKNOWN',
      errorCode: 'INTERNAL_ERROR',
      errorMessage: 'Internal connector error',
    });
  }
});

app.listen(PORT, () => {
  console.log(`FireFlow Fiscal PK connector running on port ${PORT}`);
  console.log(`Provider: ${fbrProvider.type} v${fbrProvider.version}`);
  console.log(`Capabilities: ${fbrProvider.capabilities.join(', ')}`);
});
