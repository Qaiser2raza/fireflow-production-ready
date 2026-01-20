# Fireflow Pilot Readiness & Smoke Test Checklist

**Status**: Phase 2 Complete (Grade: A-)
**Date**: Jan 20, 2026

## 🚀 1. The Smoke Test (Run before every deploy)

### A. Authentication & Tokens
- [ ] **Login**: Enter PIN `1234`. Verification: App enters `DASHBOARD`.
- [ ] **Token Storage**: Open DevTools → Application → LocalStorage. Verify `access_token` and `refresh_token` are NOT there (they should be in encrypted `electron-store`).
- [ ] **Session Restore**: Close app and reopen. Verification: App should bypass login screen and restore the session.
- [ ] **Logout**: Click Logout. Verification: Current token should be revoked. Attempting to use old token via Postman should return `401 TOKEN_REVOKED`.

### B. Secure Device Pairing
- [ ] **Generate Code**: Click "Add Device". Verification: 6-char code appears. Audit log entry created.
- [ ] **Verify Code**: Use second device/tab to verify. Verification: Device appears in "Paired Devices" list.
- [ ] **Revocation**: Disable the device. Verification: Device should immediately lose access and socket events should trigger.

### C. Atomic Operations (Crucial!)
- [ ] **Order Creation**: Seat 4 guests at Table 5. Verification:
    - [ ] `orders` table has new entry.
    - [ ] `tables` table entry for Table 5 status changed to `OCCUPIED`.
    - [ ] `active_order_id` updated.
    - [ ] All happened in a single transaction (Verified by server logs).
- [ ] **Validation**: Try to create an order with a negative price or invalid UUID. Verification: Server returns `400 Validation Failed` (Zod).

---

## 🔒 2. Final Hardware/Deployment Hardening

### Electron Security
- [ ] `webSecurity` is **ENABLED**.
- [ ] `contextIsolation` is **ENABLED**.
- [ ] `nodeIntegration` is **DISABLED**.
- [ ] `allowRunningInsecureContent` is **DISABLED**.

### Server Hardening
- [ ] `FIREFLOW_JWT_SECRET` set in `.env` (min 32 chars).
- [ ] Rate limiting active for `/api/auth/*` and `/api/pairing/*`.
- [ ] Database backup script (`pg_dump`) confirmed operational.

---

## 📈 3. Phase 3: Pilot & Scale (Next Steps)

1. **Persistent Revocation**: Move `revokedTokens` to a Prisma table or Redis so blacklists survive restarts.
2. **Silent Refresh**: Implement a frontend timer/interceptor to rotate tokens 1 minute before expiry.
3. **Inventory Alpha**: First pass at stock deduction on order fulfillment.
4. **CRM Light**: Auto-save customer phone numbers from delivery/takeaway orders.

---

**Approval**: __________________ (Lead Engineer)
**Date**: 2026-01-20
