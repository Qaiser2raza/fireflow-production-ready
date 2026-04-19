
import crypto from 'crypto';

// Minimal JWT signing logic from JwtService.ts to ensure match
function sign(payload, key) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const message = `${headerB64}.${payloadB64}`;
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(message);
    const signature = hmac.digest('base64url');
    return `${headerB64}.${payloadB64}.${signature}`;
}

const secret = 'fireflow_secret_key_2026_fyuxpkbsjjuunfqldeey';
const now = Math.floor(Date.now() / 1000);
const payload = {
  staffId: '5813339f-0042-4391-920d-111973dac5ac',
  restaurantId: 'b1972d7d-8374-4b55-9580-95a15f18f656',
  role: 'ADMIN',
  name: 'Test Admin',
  type: 'access',
  iat: now,
  exp: now + 3600,
  jti: 'test-jti'
};

console.log(sign(payload, secret));
