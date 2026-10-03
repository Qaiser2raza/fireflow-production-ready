# FireFlow Agent Handoff

Read this first, then AGENTS.md, CURRENT_STATE.md, and docs/CLOUD_AUTH_SUBSCRIPTION_DESIGN.md.
Roles: a web AI acts as CTO and writes tasks. The owner (Qaiser) pastes tasks to you and your output back. Follow tasks exactly and keep replies short.

## Working rules
- Do not run `prisma migrate dev/deploy/reset`, seeds, or anything that writes to a database unless the task says so.
- NEVER run tests, seeds or cleanup scripts against `fireflow_local`. On 2026-10-02 a broad cleanup wiped all local restaurants (tests/mission-031-b-wac.test.ts cleanDatabase and prisma/seed.ts both call restaurants.deleteMany({})). Tests may only run against a database whose name ends in `_test` (fireflow_test), enforced by a global test guard. Until that guard exists, do not run any test file.
- Never hardcode or print secrets, passwords, hashes, or tokens. Read them from env vars.
- Never use ON DELETE CASCADE on financial tables (finance_entries, payments, payment_attempts, fiscal_*, shift_sessions, journal_*). Use RESTRICT.
- After any schema change: `npx prisma validate`, and prove zero drift with
  `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <shadow db> --script` (must be empty). Shadow DB: `fireflow_shadow` on local Postgres.
- Do not delete or rewrite existing migrations. Add new ones.
- Update CURRENT_STATE.md at the end of each task (what changed, what is next).
- Final reply to the owner: max 10 lines (files changed, errors, test results).

## Environment
- Windows, repo at D:\Dev\FireFlow, Node 24, PostgreSQL 16 (service postgresql-x64-16).
- Local DB: `fireflow_local` (user postgres). Credentials are in .env (do not echo).
- Frontend: `npm run dev` (port 3000). Backend: `npm run server` (port 3001). Start only if asked; stop what you start.

## State as of 2026-10-01
- Latest commit: 81e2bb5 "feat(identity): cloud identity tables, financial FK hardening, drift cleanup". Pushed to origin/main.
- New tables exist but are NOT used by code yet: `users`, `memberships`, `user_sessions`.
- Financial foreign keys are now RESTRICT. Code that deletes restaurants/orders/payments will fail by design:
  server.ts (~1259 restaurants.delete, ~3282/4264 orders.deleteMany, ~5149 orders.delete), BaseOrderService.ts (~930 tx.orders.delete), plus dev scripts (reset_orders.ts, fix-stuck-tables.ts, db-cleanup-demo.ts, browser-smoke.cjs). To be reworked later (void/cancel orders, archive restaurants).
- Tests under tests/ delete payments/orders/restaurants in teardown and will fail on real data. Plan: separate test DB.

## Known auth problem
- Signup (RestaurantProvisioningService) creates a restaurant, an owner `staff` row (role MANAGER, hashed_pin, email NULL, password_hash NULL, is_email_verified false), an owner_invite and an email_verification_tokens row. The owner only receives a one-time PIN.
- AuthController.login looks up `staff` by email, so a new owner can never log in with email/password. Verification links are not printed or sent in dev.

## Task queue (do in order, one at a time)
1. DEV ONLY helper `scripts/dev-set-owner-password.ts`:
   - Reads OWNER_EMAIL and NEW_PASSWORD from env. No hardcoded values.
   - Refuses to run if NODE_ENV=production or DATABASE_URL host is not localhost/127.0.0.1.
   - Finds the owner staff row via owner_invites.email = OWNER_EMAIL (fallback: the restaurant's only MANAGER staff). If zero or multiple matches, print why and exit.
   - Hashes with the same bcrypt settings as AuthController. Sets staff.email, password_hash, is_email_verified=true.
   - Prints only staff id and restaurant name. Header comment: DEV ONLY, never deploy.
   - Do not run it; the owner runs it.
   STATUS: Task 1 DONE (script written, not yet committed unless the owner says so).
2. DONE (commit 27630c5, manually verified): docs/TASK_02_SIGNUP_OWNER_PASSWORD.md.
3. DONE: Task 03 (owner login on users/user_sessions), 03c (test-DB guard, non-destructive seed), 03e (/login route). 
4. NEXT: Task 03b: bind user_sessions to restaurant_id (see CTO message).
5. Then, in order: 04 tenant status/trial check after membership resolution; 04b fix self-approval in orderWorkflowRoutes.ts:323-381 (skip-approval needs a manager PIN/permission and must not allow self-approval); super admin + payment proofs; 05 emails; 06 /r/:slug routing and /admin shell.
6. Devices (docs/DEVICES_ROLES_DESIGN.md, audit in docs/AUDIT_DEVICES.md), in small steps: 07b additive schema on registered_devices (status PENDING/ACTIVE/REVOKED, device_type, approved_by/at, revoked_by/at), hashed pairing codes; 07c pairing creates PENDING + approve/revoke routes + hashed httpOnly device cookie + deviceAuthMiddleware, PIN login requires ACTIVE device; 07d minimal manager Devices screen; 07e server-side station scope for KDS (display vs interactive mode), device audit via audit_logs.device_id.
   Device facts from the audit: registered_devices.auth_token_hash is write-only (never validated); token also sits in localStorage and an Electron store with a hardcoded key; pairing codes are plaintext; KDS station filtering is client-side only. No real customers/devices exist yet, so existing paired devices can simply re-pair (no complex backfill). Do not create a second device system; extend registered_devices and fold staff_devices in via device_id.
3. (Later) Tenant status/subscription fields, payment_proofs, super admin panel, RLS, AI adapter. See the design doc.

## Open items
- docs/AUDIT_AUTH_TENANCY.md (Prompt 01) has not been reviewed by the CTO yet. If it exists, summarize the gap analysis when asked.
