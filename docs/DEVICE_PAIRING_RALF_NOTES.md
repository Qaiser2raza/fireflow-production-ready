# Device Pairing Security – Ralf's Implementation Notes

**Timestamp**: January 20, 2026, 12:00 UTC  
**By**: Ralf (Senior Full-Stack Engineer)

---

## 🎯 What Problem Are We Solving?

**Before**: QR codes had no security. A screenshot of a code could pair ANY device. Codes never expired. No audit trail.

**After**: 
- Codes are one-time use + device fingerprinted
- Codes expire in 15 minutes (auto-cleaned)
- Attempt limiting prevents brute force
- Every pairing is audited
- Tenant isolation enforced everywhere

---

## 🔐 Key Security Decisions

### Decision 1: 6-Character Alphanumeric Codes
**Why**: Human-readable (user can type manually). ~2.2M combinations. Sufficient entropy given 15-min expiry + rate limiting.

**Trade-off**: Lower entropy than 32-char hex, but the time window + rate limiting compensates.

**Alternative considered**: Full 32-char hex token → User can't type, reduces usability. Rejected.

---

### Decision 2: Bcrypt Hashing for Everything
**Why**: Consistent with PIN hashing phase (Phase 2.0). Even if DB leaks, codes can't be reused (one-way hash). Same for auth tokens.

**Trade-off**: +50ms per verify operation (bcrypt.compare). Acceptable for pairing (not auth loop).

**Why not JWT for tokens**: JWT doesn't prevent replay if leaked. Bcrypt hash + per-device uniqueness is safer.

---

### Decision 3: Device Fingerprinting (userAgent + screen + timezone)
**Why**: Simple to compute, prevents screenshot reuse (code can't be used on different device). No external dependencies.

**Not included**: IP address (VPNs), MAC address (browser-inaccessible), geolocation (privacy).

**Trade-off**: Fingerprints can collide (2+ devices on same machine), but we solve this with per-staff uniqueness constraint.

**Edge case**: If staff pairs device on machine A, then pairs again on machine B (same browser, screen, timezone? unlikely but possible) → Second device replaces first token. This is acceptable (we log it in audit trail).

---

### Decision 4: Attempt Counting (Lock After 5 Failures)
**Why**: Prevents brute force. 5 attempts = ~0.0002% success rate (out of 2.2M codes, with 15-min TTL).

**Rate limiting is ALSO applied**: 10 verify attempts per minute per IP. Double protection.

**Trade-off**: Legitimate user with fat fingers locks out after 5 tries → Must generate new code. Minor friction.

**Why not per-code rate limiting only**: Per-IP prevents attacker from spreading across users.

---

### Decision 5: Automatic Cleanup Every 5 Minutes
**Why**: Expired codes should not accumulate in DB. 15-min codes → clean up every 5 min ensures no stale data.

**Implementation**: `setInterval` in server startup. Simple, no external job scheduler.

**Trade-off**: If server restarts, cleanup job stops temporarily. Acceptable (PostgreSQL can run cleanup separately if needed).

---

### Decision 6: Tenant Isolation: NOT NULL restaurant_id Everywhere
**Why**: Fireflow is multi-tenant (Pakistan has 100k+ restaurants). One breach shouldn't compromise all restaurants.

**Implementation**: 
- `restaurant_id NOT NULL` in schema
- Check `restaurant_id === currentRestaurant` on every endpoint
- Unique constraint `(restaurant_id, pairing_code)` per-restaurant
- Indexes on `restaurant_id` for fast queries

**Trade-off**: Slightly more DB traffic (one extra where clause), but security is non-negotiable.

---

### Decision 7: Socket.IO Real-time Device Updates
**Why**: When staff pairs a device in Settings, other staff should see it in Device Management in real-time.

**Implementation**: Emit `device_change` event to `restaurant:${id}` room on successful pairing/disabling.

**Alternative considered**: Polling GET /api/pairing/devices every 30s → Wasteful, outdated info.

**Trade-off**: Requires Socket.IO connection (already required for orders, so zero overhead).

---

## 🏗️ Architecture Decisions

### Why Service Layer?
**Decision**: `PairingService.ts` is a separate service, not inline in server.ts.

**Rationale**: 
- Testable (mock PrismaClient)
- Reusable (future: gRPC, scheduled jobs)
- Clear separation of concerns

---

### Why Transaction Wrapping?
**Decision**: `verifyPairingCode()` uses `prisma.$transaction()`.

**Rationale**: All-or-nothing: Update code + register device + create audit log. If any step fails, entire operation rolls back. No partial states.

---

### Why No Redux/Zustand on Frontend?
**Decision**: Use React Context (AppContext) to pass staffId to pairing component.

**Rationale**: Fireflow's architecture uses Context everywhere. Consistent with codebase. No new dependencies.

---

## 🚨 Known Limitations (To Be Fixed)

### 1. **x-staff-id Header Is Temporary**
Currently: Pairing endpoints trust `x-staff-id` header sent by client.

Problem: Client can spoof any staffId.

Fix: JWT implementation in Phase 2.2 → Extract staffId from token.

Timeline: 1 line change per endpoint when JWT lands.

```typescript
// Current (insecure)
const staffId = req.headers['x-staff-id'];

// After JWT
const staffId = req.user.id; // From JWT decoded in middleware
```

---

### 2. **Rate Limiting Is In-Memory**
Current: `express-rate-limit` uses in-memory store.

Problem: Resets on server restart. Doesn't scale to multiple processes.

Fix: Switch to Redis store in production.

Timeline: Low priority (not MVP-blocking).

---

### 3. **Device Token Storage on Client Not Specified**
Current: Endpoint returns `auth_token: "64_char_hex"` — Client must decide where to store.

Options:
- **Electron**: Use `keytar` (native secure storage) ✓ Recommended
- **Web**: Use secure cookie (httpOnly, secure, sameSite) ✓ Recommended
- **Do NOT use**: localStorage (XSS vulnerable)

Timeline: Implement before device-based auth endpoints use the token.

---

## ✅ What's Production-Ready Now

- ✓ Database models (pairing_codes + registered_devices)
- ✓ Pairing endpoints with rate limiting
- ✓ Fingerprinting on frontend
- ✓ Audit logging
- ✓ Cleanup job
- ✓ Socket.IO broadcasting
- ✓ Error handling (401/410/409/429 codes)
- ✓ Tenant isolation enforced

## 🚀 What Needs Work

- 🔄 JWT implementation (replace x-staff-id)
- 🔄 Device token secure storage (client-side)
- 🔄 Device-based middleware (validate token on device endpoints)
- 🔄 E2E tests (test full pairing flow)

---

## 📚 Code Quality Metrics

| Metric | Status |
|--------|--------|
| **TypeScript strict** | ✓ No `any` types |
| **Error handling** | ✓ Mapped to HTTP codes |
| **Security checks** | ✓ Auth, rate limiting, tenant isolation |
| **Audit trail** | ✓ All events logged |
| **Documentation** | ✓ Inline comments + docs/ |
| **Transaction safety** | ✓ Atomic operations |
| **Input validation** | 🔄 TODO: Add zod/joi schemas |

---

## 🔍 Testing Priorities

### High Priority (Do First)
1. Happy path: Generate → Verify → Register
2. Security: Code reuse prevention
3. Security: Rate limiting
4. Tenant isolation: Restaurant A can't see Restaurant B codes

### Medium Priority
5. Attempt locking (6th attempt fails)
6. Code expiry + cleanup job
7. Device fingerprint collision handling
8. Socket.IO broadcast

### Low Priority (Nice-to-Have)
9. Concurrent pairing race conditions
10. Large-scale cleanup (1000+ expired codes)
11. Redis store stress test

---

## 🎓 Lessons Learned

**What worked well:**
- Service layer abstraction (testable, reusable)
- Transaction wrapping (safety)
- Per-restaurant scoping (tenant isolation)
- Socket.IO for real-time (no polling)

**What to improve next:**
- Input validation (needs zod/joi integration)
- Async job scheduler (replace setInterval with bullmq/agenda)
- Observability (structured logging, metrics)

---

## 📞 Questions & Answers

**Q: Why bcrypt for codes instead of scrypt?**  
A: Consistency with PIN hashing. Bcrypt is simpler to understand and debug. Performance difference negligible for this use case.

**Q: Can an attacker brute-force a code?**  
A: No. Rate limiting (10/min IP), attempt locking (5 failures), and 15-min expiry make it infeasible.

**Q: What if a staff member's device is stolen?**  
A: Admin can disable it in Settings. Attacker can't use device without the auth_token (which expires on disable). Previous actions are audited.

**Q: Does device fingerprinting work across browsers?**  
A: No. Safari fingerprint ≠ Chrome fingerprint. This is intentional (prevents shared device from pairing in multiple browsers).

**Q: Why not use TOTP/2FA instead?**  
A: Overkill for device pairing. PIN-based auth in Pakistan doesn't usually use 2FA. Fingerprinting + one-time codes + rate limiting is sufficient.

---

## 🚀 Next Milestone

**Phase 2.2 (JWT Implementation)**
- [ ] Generate JWT on login (12h expiry, refresh token)
- [ ] Verify JWT on protected endpoints
- [ ] Extract staffId from token (replace x-staff-id header)
- [ ] Device auth middleware (validate auth_token + device_id)

Estimated time: 2-3 hours.

---

**End of Notes**

Ralf.
