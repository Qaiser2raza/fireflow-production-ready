import { Request, Response, NextFunction } from 'express';
import { HmacAuth } from '../services/fiscal/HmacAuth';
import { VerifiedHmacRequest } from '../services/fiscal/HmacAuth';

export interface AuthenticatedFiscalConnectorRequest extends Request {
  fiscalConnectorAuth?: VerifiedHmacRequest;
}

export function fiscalConnectorAuthMiddleware(req: AuthenticatedFiscalConnectorRequest, res: Response, next: NextFunction): void {
  const hmacAuth = HmacAuth.getInstance();

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

  const verifiedRequest: VerifiedHmacRequest = {
    keyId,
    audience,
    timestamp: Number(timestamp),
    nonce,
    requestId,
    bodyHash,
    signature,
    expiryWindowMs: 5 * 60 * 1000,
  };

  const verification = hmacAuth.verify(verifiedRequest, req.body, signature);
  if (!verification.valid) {
    res.status(401).json({ error: `HMAC verification failed: ${verification.error}` });
    return;
  }

  req.fiscalConnectorAuth = verifiedRequest;
  next();
}
