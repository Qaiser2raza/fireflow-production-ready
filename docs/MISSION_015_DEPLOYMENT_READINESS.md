# Mission 015 — Deployment Readiness

**Date:** 2026-08-21
**Status:** COMPLETE
**Branch:** main

---

## 1. CURRENT STATE

### Verified Baseline
- Missions 009–013: 104/104 tests passed
- Mission 014A: 23/23 tests passed (including 7 new generic API tests)
- Total: 127/127 tests passed
- 31 database migrations apply successfully from empty PostgreSQL
- Cravex: future-only, not implemented

### CI/CD
- **GitHub Actions workflow created** at `.github/workflows/ci.yml`
- Uses `postgres:16-alpine` service container
- Runs all 6 mission test files automatically
- Typecheck + build configured

### Frontend PIN Handling
- `src/client/App.tsx:287` plaintext `saved_pin` storage REMOVED
- Auto-login via `saved_pin` REMOVED
- JWT token persistence preserved
- Logout clears all auth state

### Generic API Endpoint
- `GET /api/:table` secured with:
  - `authMiddleware` (already present)
  - `restaurant_id` scoping (already present)
  - Sensitive tables deny-list: `staff`, `audit_logs`, `security_events`, `payments`, `subscription_payments`, `license_keys`, `fbr_sync_logs`
  - Sensitive fields filter: `pin`, `hashed_pin`, `password`, `secret`, `token`, `key`, etc.
- Allowed tables: `menu_items`, `menu_categories`, `tables`, `sections`, `stations`

### PIN Migration
- `scripts/migrate-pins-to-bcrypt.ts` verified on isolated database
- Plaintext PINs cleared after hashing
- Production procedure documented

### Flaky Test
- Mission 010 Test 7 (retryable failure) stabilized
- Root cause: `lock_expires_at` was null after retry scheduling, allowing immediate re-claim
- Fix: Set `lock_expires_at` to `available_at` in `IntegrationDispatcher.markFailed()`
- Test window adjusted to 500ms (less than 1s backoff)

---

## 2. RISKS

| Risk | Severity | Status |
|---|---|---|
| No CI pipeline | HIGH | RESOLVED |
| Plaintext PIN in localStorage | HIGH | RESOLVED |
| Flaky CI tests | MEDIUM | RESOLVED |
| Generic API exposure | MEDIUM | RESOLVED |
| PIN migration unverified | MEDIUM | RESOLVED |
| Secrets in .env.example | LOW | DOCUMENTED |

---

## 3. GAPS

All identified gaps have been resolved:
1. CI missing → Created `.github/workflows/ci.yml`
2. No isolated DB in CI → PostgreSQL 16 service configured
3. Frontend PIN storage → Removed `saved_pin` persistence
4. Flaky test → Fixed `lock_expires_at` logic
5. Generic API → Added sensitive table deny-list
6. PIN migration → Verified on isolated DB
7. Documentation → Updated with CI setup, test commands, env requirements

---

## 4. REQUIRED CHANGES

### 4.1 CI Pipeline
- Created `.github/workflows/ci.yml`
- Uses `postgres:16-alpine` service container
- Applies all 31 migrations from empty database
- Runs all 6 mission test files
- Fails on test failure

### 4.2 Stabilize Mission 010 Test 7
- Fixed `IntegrationDispatcher.markFailed()` to set `lock_expires_at` to `available_at`
- Prevents immediate re-processing of retryable failures
- Test sleep adjusted to 500ms

### 4.3 Remove Frontend saved_pin
- Removed `localStorage.setItem('saved_pin', pin)` from login
- Removed auto-login `useEffect` that reads `saved_pin`
- Preserved JWT token persistence and secure login behavior

### 4.4 Secure Generic API Endpoint
- Added `GENERIC_API_SENSITIVE_TABLES` deny-list
- Blocks access to sensitive tables even if accidentally added to whitelist
- Added regression tests

### 4.5 Verify PIN Migration
- Run against isolated test database
- Confirmed plaintext PINs cleared after hashing
- Documented production procedure

### 4.6 Documentation
- Updated CI setup instructions
- Updated test commands
- Updated environment requirements
- Updated staging prerequisites
- Updated known remaining risks

---

## 5. TEST RESULTS

### All Tests Passing

| Suite | Tests | Result |
|---|---|---|
| Mission 009 (outbox) | 15 | 15/15 passed |
| Mission 010 (integration) | 24 | 24/24 passed |
| Mission 011 (payments) | 24 | 24/24 passed |
| Mission 012 (fiscal boundary) | 27 | 27/27 passed |
| Mission 013 (fiscal connector) | 14 | 14/14 passed |
| Mission 014A (security) | 23 | 23/23 passed |
| **Total** | **127** | **127/127 passed** |

### Migration Verification
- All 31 migrations apply successfully from empty PostgreSQL database
- Verified on `fireflow_test_clean_015`

---

## 6. FILES CHANGED

### Core Changes
- `.github/workflows/ci.yml` — New CI workflow
- `src/client/App.tsx` — Removed `saved_pin` localStorage persistence
- `src/api/server.ts` — Added sensitive table deny-list to generic API
- `src/api/services/integration/IntegrationDispatcher.ts` — Fixed `lock_expires_at` in `markFailed()`
- `tests/mission-010-integration-runtime.test.ts` — Stabilized retryable failure test
- `tests/mission-014A-pos-security.test.ts` — Added 7 generic API authorization tests
- `scripts/migrate-pins-to-bcrypt.ts` — Updated to clear plaintext PINs
- `docs/MISSION_015_DEPLOYMENT_READINESS.md` — This document

---

## 7. EXIT CRITERIA

- [x] CI runs the complete suite successfully
- [x] Clean migration test passes
- [x] Saved PIN handling is safe
- [x] Generic table endpoint has documented and tested authorization boundaries
- [x] All 127 tests pass
- [x] All 31 migrations apply from empty DB
- [x] No secrets in code, logs, tests, or documentation
- [x] Cravex not implemented
- [x] Production not deployed

---

## 8. NEXT STEPS

```text
Supabase staging setup
→ Vercel staging deployment
→ end-to-end testing
→ production deployment
```

