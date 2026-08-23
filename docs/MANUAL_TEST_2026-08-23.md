# Manual Test Session — Onboarding & Auth (2026-08-23)

Manual team-test of the Mission 016B security foundation on `main` @ `1edb284`
(pre-push). Executed by founder via UI; scripted DB evidence by agent.

## Environment

- Licensed tenant `b1972d7d-8374-4b55-9580-95a15f18f656` "Fireflow Restaurant" (PREMIUM/ACTIVE)
- Dev DB pruned to exactly this one tenant
- Test staff seeded: `Test Manager` / MANAGER / PIN bcrypt-hashed (plaintext never stored)
- Local Express API :3001 + Vite :3000; licensing status endpoint in test-mode exemption

## Results Matrix

| # | Test | Result |
|---|---|---|
| 1 | Correct PIN login → dashboard, manager-scoped nav | PASS |
| 2 | Wrong PIN → generic rejection, no info leak | PASS |
| 3 | Reload → forced re-PIN, no silent session restore | PASS |
| 4 | UI logout → Terminal Access, tokens cleared | PASS |
| 5 | Lockout: 5 failures → correct PIN also rejected generically | PASS |
| 6 | Lockout DB evidence: `failed_login_count=5`, `locked_until=+30min` | PASS |
| 7 | Scripted unlock (`scratch/unlock-staff.cjs`) → immediate re-access | PASS |

## Findings (deferred — neither blocks onboarding/auth)

### F-1: REGISTER NEW RESTAURANT → blank page
Device-side self-registration button leads to an unwired route (device-pairing /
`registerRestaurant` flow not connected). Known deferred feature.

### F-2: `GET /api/orders/qr-pending` permanent 404 loop
Route shadowing: wildcard `app.get('/api/orders/:id')` (src/api/server.ts:3231)
is registered BEFORE the real handler `app.get('/api/orders/qr-pending')`
(src/api/server.ts:3944); line 3235 deliberately 404s reserved words including
`'qr-pending'`, making the real handler unreachable dead code. Dashboard's QR
approval poller hits it repeatedly → console error noise; QR approval queue can
never load via REST. Fix = move specific routes above the wildcard. Queued as
its own small bug-fix task (legitimate server.ts exception per Critical Rule 3).

## Session Notes

- PowerShell environment: inline `node -e` quoting unreliable → all DB work via
  one-shot helpers in untracked `scratch/` (`list-tenants.cjs`,
  `prune-to-licensed.cjs`, `create-owner.cjs`, `unlock-staff.cjs`).
- Manager `verify-pin` override skipped manually (needs order/void context);
  covered by API suites.
