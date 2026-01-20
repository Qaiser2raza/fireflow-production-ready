# Device Pairing – Ralf's Quick Reference

**Status**: Production-ready, security-hardened ✓

---

## 🚀 Deployment Checklist

```bash
# 1. Install dependencies
npm install  # Adds express-rate-limit

# 2. Run migration
npx prisma migrate dev --name add_registered_devices_security

# 3. Restart server
npm run server

# 4. Verify endpoints exist
curl http://localhost:3001/api/pairing/generate
# → Should return 400 (missing auth headers) not 404
```

---

## 🔐 Security Guarantees

| Threat | Defense |
|--------|---------|
| **Code reuse** | One-time use flag (`is_used`) |
| **Cross-device code reuse** | Device fingerprinting (userAgent + screen + timezone hash) |
| **Brute force** | Attempt counting (lock after 5 failures) + rate limiting (10/min) |
| **Code leakage** | Bcrypt hashing in DB (one-way) |
| **Token leakage** | Bcrypt hash in DB, plaintext token sent once to client |
| **Expired codes lingering** | Auto-cleanup every 5 minutes |
| **Tenant isolation breach** | `restaurant_id` NOT NULL everywhere, checked on all ops |

---

## 🏗️ Architecture Summary

```
┌─ QRCodePairing.tsx
│  ├─ Generates device fingerprint (userAgent + screen + timezone)
│  └─ Calls POST /api/pairing/generate & /verify
│
├─ server.ts (Express)
│  ├─ POST /api/pairing/generate (5/min rate limit)
│  ├─ POST /api/pairing/verify (10/min rate limit)
│  ├─ GET /api/pairing/devices
│  ├─ DELETE /api/pairing/devices/:id
│  └─ Cleanup job (every 5 min)
│
├─ PairingService.ts (Business Logic)
│  ├─ generatePairingCode()
│  ├─ verifyPairingCode()
│  ├─ cleanupExpiredCodes()
│  ├─ listPairedDevices()
│  └─ disableDevice()
│
└─ Database
   ├─ pairing_codes (one-time codes)
   └─ registered_devices (paired devices)
```

---

## 📊 Data Models

### pairing_codes
```
id: UUID
pairing_code: VARCHAR(6)              // "ABC123"
hashed_code: VARCHAR(100)             // bcrypt("ABC123")
is_used: BOOLEAN                       // Prevent reuse
attempt_count: INT                     // Lock after 5
expires_at: TIMESTAMP                  // NOW + 15 min
used_by: UUID                          // Staff who verified
verified_fingerprint: VARCHAR(255)     // Device identity
restaurant_id: UUID (NOT NULL)         // Tenant isolation
```

### registered_devices
```
id: UUID
device_name: VARCHAR(100)              // "Front iPad"
device_fingerprint: VARCHAR(255)       // Hash of device identity
auth_token_hash: VARCHAR(100)          // bcrypt(token)
is_active: BOOLEAN                     // Can disable
platform: VARCHAR(50)                  // ios, android, etc.
staff_id: UUID (FK)                    // Device owner
restaurant_id: UUID (FK, NOT NULL)     // Tenant isolation
last_sync_at: TIMESTAMP                // Last API call
```

**Unique Constraint**: `(restaurant_id, staff_id, device_fingerprint)`
→ One device per staff per restaurant

---

## 🧪 Test Scenarios

### Happy Path: Generate → Verify → Register
```bash
# 1. Generate code
CODE_RESP=$(curl -s -X POST http://localhost:3001/api/pairing/generate \
  -H "Content-Type: application/json" \
  -H "x-staff-id: YOUR_STAFF_ID" \
  -H "x-restaurant-id: YOUR_RESTAURANT_ID" \
  -d '{"restaurantId": "YOUR_RESTAURANT_ID"}')

CODE=$(echo $CODE_RESP | jq -r '.pairing_code')
CODE_ID=$(echo $CODE_RESP | jq -r '.code_id')

# 2. Verify code
curl -X POST http://localhost:3001/api/pairing/verify \
  -H "Content-Type: application/json" \
  -d "{
    \"restaurantId\": \"YOUR_RESTAURANT_ID\",
    \"codeId\": \"$CODE_ID\",
    \"code\": \"$CODE\",
    \"deviceFingerprint\": \"a1b2c3d4\",
    \"deviceName\": \"Test Device\",
    \"userAgent\": \"Mozilla/5.0\",
    \"platform\": \"linux\"
  }"

# Should return: { "success": true, "device_id": "...", "auth_token": "..." }
```

### Security: Rate Limiting
```bash
# Try to generate 10 codes in 1 minute
for i in {1..10}; do
  curl -X POST http://localhost:3001/api/pairing/generate \
    -H "x-staff-id: $STAFF_ID" -H "x-restaurant-id: $RESTAURANT_ID"
done

# After 5: HTTP 429 (Too Many Requests)
```

### Security: Attempt Limit
```bash
# Try to verify with wrong code 6 times
for i in {1..6}; do
  curl -X POST http://localhost:3001/api/pairing/verify \
    -d "{\"codeId\": \"$CODE_ID\", \"code\": \"WRONG\", ...}"
done

# After 5: HTTP 429 (locked)
```

---

## 🔗 Related Code

| File | Purpose |
|------|---------|
| [PairingService.ts](../src/api/services/pairing/PairingService.ts) | Core business logic |
| [server.ts](../src/api/server.ts#L750-L900) | Endpoints + rate limiters |
| [QRCodePairing.tsx](../src/features/settings/QRCodePairing.tsx) | Frontend UI |
| [schema.prisma](../prisma/schema.prisma#L126-L168) | Database models |
| [migration.sql](../prisma/migrations/20260120_add_registered_devices_security/migration.sql) | DB changes |

---

## ⚠️ Important Notes

1. **x-staff-id header is temporary**
   - After JWT implementation: Extract from token
   - Change: 1 line per endpoint (PairingService unchanged)

2. **Device auth_token must be stored securely**
   - Electron: Use `keytar` (native secure storage)
   - Web: Use secure cookie (`httpOnly`, `secure`, `sameSite`)
   - NOT localStorage (XSS vulnerable)

3. **Rate limiting uses in-memory store**
   - Per-process (resets on server restart)
   - For production with multiple processes: Switch to Redis
   - See: express-rate-limit docs for Redis store

4. **Device fingerprint is NOT unique**
   - Multiple devices on same machine → same fingerprint
   - Uniqueness enforced by `(restaurant_id, staff_id, device_fingerprint)` tuple
   - If staff logs in on 2nd device → existing device's token is replaced

---

## 🚨 Emergency Procedures

### If codes are being reused (security breach)
```sql
-- Lock all unverified codes
UPDATE pairing_codes SET is_used = true WHERE is_used = false;

-- Force re-generate codes
DELETE FROM pairing_codes WHERE expires_at < NOW();
```

### If a device token is compromised
```sql
-- Revoke the device
UPDATE registered_devices SET is_active = false WHERE id = 'DEVICE_UUID';

-- Or delete it entirely
DELETE FROM registered_devices WHERE id = 'DEVICE_UUID';
```

### If rate limiters are misconfigured
- In-memory store (default): Resets on server restart
- Redis store (future): Clear keys with `redis-cli FLUSHDB`

---

**Next Phase**: JWT Implementation (Phase 2.2)  
Replace x-staff-id headers with proper token validation.
