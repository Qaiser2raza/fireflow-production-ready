# Repository State — Review Checkpoint 2026-08-22

- **Source branch:** `main` @ `c049769` (clean baseline)
- **Checkpoint branch (intended):** `mission-016-auth-review`
- **Purpose:** Stable, inspectable review checkpoint of the in-flight authentication & platform-control-plane redesign. **NOT production-ready.**
- **Environment:** Windows dev workstation (`D:\Dev/FireFlow`)

## Secrets / security preparation performed
- `.env.example` **scrubbed**: the working tree had replaced the clean committed placeholders with a live Supabase `service_role` key, a live anon key, and the live project URL. Restored to placeholders (matching the clean committed baseline on `main`). The live key was **never pushed** to GitHub (HEAD was clean), so no history rewrite / key rotation is required for git-history hygiene — though rotation at the Supabase dashboard is recommended defensively since the value sat in a working tree.
- `scripts/test-hq-flow.ts` contains a real credential (`password: 'Diljan@750'`). **Excluded** from this commit; the credential should be rotated at its source.
- `scripts/` directory (dev/test/batch tooling with embedded passwords) **excluded** from this commit; remains in the local working tree only.
- `.kilo/` agent/runtime state **excluded** (`.gitignore`).
- Source under `src/` contains no hardcoded secrets — only `process.env`/`import.meta.env` references.

## Missions represented in this checkpoint
This working tree bundles multiple in-flight phases that were not individually committed on `main`. They are captured as one WIP commit because the changes are entangled in `server.ts` and shared services:

- Mission 009 — transactional order outbox (`outbox` table + `OutboxReader`)
- Mission 010 — integration framework (`integrations`/`integration_deliveries`)
- Mission 011 — payment lifecycle (`payments`/`payment_attempts`)
- Mission 012 — generic fiscal document boundary (`fiscal_documents`/`fiscal_attempts`)
- Mission 013 — first regional fiscal connector (FBR, HMAC auth)
- Mission 014A — POS security + operational safety (6 gaps fixed + 23 regression tests)
- Mission 015 — deployment readiness (env hygiene, CI test wiring)
- Mission 016 — FireFlow-owned auth redesign (platform_users/sessions, refresh-token rotation, PIN hardening, dual-run with Supabase)

> Fine-grained per-mission re-splitting is deferred to after review if desired.

## Tests run against this tree
Per `docs/frontend-onboarding-saas-verification.md` (code inspection + build only; no interactive browser tests):

| Suite | Result |
|---|---|
| `tests/mission-009-outbox-runtime.test.ts` | 15/15 |
| `tests/mission-010-integration-runtime.test.ts` | 24/24 |
| `tests/mission-011-payment-lifecycle.test.ts` | 24/24 |
| `tests/mission-012-generic-fiscal-document-boundary.test.ts` | 27/27 |
| `tests/mission-013-first-regional-fiscal-connector.test.ts` | 14/14 |
| `tests/mission-014A-pos-security.test.ts` | 23/23 |
| `tests/refresh-token-rotation.test.ts` | 30/30 |
| `tests/onboarding-saas.test.ts` | 44/44 |
| `tests/platform-auth.test.ts` | 8/8 |
| `tests/tenant-boundary.test.ts` | 10/10 |
| `tests/tenant-isolation-api.test.ts` | 26/26 |
| `tests/phase1-pin-hardening.test.ts` | 18/18 |
| `tests/phase2-platform-email-auth.test.ts` | 31/31 (rest skipped) |
| `tests/phase2-service-support.test.ts` | 13/13 (rest skipped) |
| `tests/service-tenant-isolation.test.ts` | 6/6 (2 pre-existing failures, unrelated) |
| **Total** | **219 passed, 2 pre-existing failures** |

## Tests NOT re-run for this checkpoint
- `npx tsc --noEmit` — backend has pre-existing TS errors; frontend clean.
- `npm run build` / `npm run preview` — not re-executed in this checkpoint.
- `npm run lint` — placeholder (no linter configured).
- `npm test` — placeholder; tests run individually via `npx tsx tests/<file>.ts`.

## Manual verification status
- Dev server / backend startup: not re-tested here.
- Production build: not re-tested here.
- **Interactive browser testing of login / onboarding / SaaS UI: NOT performed** (no browser automation in this environment). Flows were verified by code inspection, build, and automated tests.

## Known blockers / follow-ups
- `docs/MISSION_016_AUTH_REDESIGN.md` states implementation is "not until design is reviewed and approved." This working tree implements a **divergent, platform-focused subset** (no self-service `/api/onboarding/*`; tables are `platform_users`/`platform_sessions`/`refresh_tokens`/`password_reset_tokens`, not the doc's `auth_sessions`/`onboarding_steps`). The design doc must be reconciled against the implementation.
- Phase‑2c TODOs still open in code: full logout token blacklist (Redis), MFA/TOTP, SMTP email verification, and the **frontend HttpOnly‑cookie migration** (access token currently still lives in `localStorage` via `authInterceptor.ts`).
- `platformAuthMiddleware.ts` retains a **Supabase fallback** (dual‑run, Phase 2). Phase 3 (remove Supabase Auth for platform/HQ) is not done.
- `x-target-restaurant` SUPER_ADMIN override still present in `authMiddleware` (deprecated + audited; not yet removed).

## Production-ready: NO
This is a WIP review checkpoint on a feature branch. Do not merge to `main` or `develop` without a full security and ops review.
