---
status: DRAFT
audience:
  - engineering
owner: FireFlow team
last_reviewed: 2026-08-23
source: Phase 1 Slice C
sensitivity: internal
---

# Slice C working notes — Vault provisioning UI (2026-08-23)

## API contract (verified against code, matches CTO-stated contract — no discrepancy)

- `POST /api/super-admin/restaurants/provision`
  - 201 `{ restaurant: <full row>, ownerStaff: { id, name, role, must_change_pin: true, pin_expires_at, temporary_pin }, owner_invite_id }`
  - 400 `{ error }` (validation / duplicate slug) · 403 non-SUPER_ADMIN
  - `temporary_pin` exists ONLY in this response body (one-time handover secret)
- `GET /api/super-admin/owner-invites`
  - `[ { invite_id, restaurant_id, restaurant_name, email, state, attempt_count, last_error, invited_at, updated_at } ]`
  - states: `INVITE_PENDING | INVITE_SENT | INVITE_UNKNOWN | INVITE_FAILED_RETRYING | INVITE_FAILED_MANUAL`
  - `last_error` carries sanitized codes only (`SUPABASE_*`, `MAX_ATTEMPTS_EXHAUSTED`)
- `POST /api/super-admin/owner-invites/:id/retry`
  - 200 `{ success: true, state: 'INVITE_PENDING' }` · 409 `{ error }`

## Auth/navigation patterns observed

- Vault mounts only when `currentUser.role === 'SUPER_ADMIN'` (App.tsx:289,1007,1232); server `requireRole('SUPER_ADMIN')` remains the final control.
- Fetch pattern: `fetchWithAuth` from `src/shared/lib/authInterceptor` with `API_BASE = origin + '/api'`.
- Tab union at SuperAdminView.tsx:48; restaurants tab renders filterable card list (:304-364).
- Cross-tenant note: the Vault is the platform-owner surface; the invites endpoint intentionally spans tenants behind SUPER_ADMIN auth (server-enforced). No tenant-scoping change required for Slice C.

## UI decisions

- One new component `ProvisionRestaurantModal` (+ exported pure helpers for badge metadata & slug validation so they are unit-testable without a DOM runner — TD-5 still open).
- Handover phase holds `temporary_pin` in React memory only; cleared on close; never persisted/logged; print uses a print-only CSS block.
- Badge map: PENDING(amber) SENT(green) VERIFYING(blue) RETRYING(orange) ACTION REQUIRED(red).
- Retry affordance shown for FAILED_MANUAL / UNKNOWN / FAILED_RETRYING states.
