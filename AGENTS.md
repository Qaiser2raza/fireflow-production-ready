# FireFlow — Agent Context

Primary instruction file for Kilo Code agents. Keep this file short; details live in linked documents.

## Read before every task

1. Read this file completely.
2. Read `docs/AI/README.md` (documentation index + authority order).
3. Read `docs/AI/ENGINEERING_INSTRUCTIONS.md` (full engineering instructions, invariants, verification and commit discipline).
4. Read the active mission or phase document.
5. Read relevant canonical architecture and security documents.
6. Read `docs/technical-debt/REGISTER.md`, if present.
7. Check recent commits and working-tree status.
8. Treat archived, superseded, and draft documents as non-authoritative unless explicitly instructed otherwise.

If any required file is missing, unclear, or contradictory, stop and report that before changing code.

## Source Priority

When information conflicts, use this order:

1. Explicit current founder/product decisions (this file, `PROJECT_CONSTITUTION.md`, `CURRENT_STATE.md`)
2. Verified current repository behavior (code, database schema, running system)
3. Accepted architectural decisions (`docs/adr/`)
4. Current domain specifications (`ARCHITECTURE.md`, `CURRENT_STATE.md`)
5. Existing canonical documentation
6. Historical/legacy documents (`docs/legacy/`, archived/superseded material)

Never silently resolve a serious contradiction. If something cannot be established, mark it UNKNOWN and report it.

## Product Truth

FireFlow is an AI-native Business Operating System initially focused on the restaurant vertical. The existing restaurant operational system (POS, orders, kitchen display, inventory, accounting, delivery, tenant management) is the foundation; AI is an assistance layer over deterministic business systems. FireFlow owns restaurant operations end to end.

Cravex is a separate commerce system integrating only through authenticated contracts. Regional compliance providers (FBR, ZATCA, ETA) enter through generic fiscal contracts — provider specifics live in connectors. AI is accessed only through a FireFlow-owned gateway: no raw DB access, no cross-tenant reads, no direct approval of accounting/payment/refund/void actions.

The system must remain modular and provider-independent. No Cravex, FBR, AI, DSH, DeepSeek, Qwen, Google, or other provider may become a core dependency.

## Non-negotiable invariants (summary)

1. **Tenant isolation**: no request, event, worker, adapter, socket, or AI tool crosses tenant boundaries; tenant context comes from trusted authentication/server state, never client hints.
2. **Backend financial authority**: backend decides all money math; frontend may preview only.
3. **Hybrid awareness**: operational data on local PostgreSQL via Express API; SaaS data (licenses, subscriptions, payments) via Supabase cloud through `cloudClient.ts`.
4. **No destructive refactors**: `src/api/server.ts` changes only for genuine bug fixes.
5. **Immutability**: posted accounting records are immutable.
6. **Unknown is not failure**: external timeouts are never proof of failure; unknown outcomes stay reconcilable.
7. **Events are business facts**, not provider commands.
8. **Secrecy**: secrets, private keys, plaintext PINs, tokens, and production personal data never enter logs, events, training data, or documentation.
9. **Script-first verification**: one-shot `scratch/*.cjs` evidence helpers; tracked `scripts/release-gate.cjs` gates every push.
10. **Branding**: "Fireflow Restaurant" for tenants; "Powered by Fireflow" as SaaS badge.

## Mission and scope discipline

Smallest safe change, inside the active mission, after identifying the relevant transaction boundary and invariant. No broad refactors, no drive-by redesigns of nearby domains. Out-of-scope issues get documented and classified in the technical-debt register, not fixed opportunistically.

Workflow: Inspect -> Understand -> Identify invariant -> Make smallest change -> Test -> Review -> Commit.

## What NOT to Assume

- Old `.md` files in `docs/` are often historical; check status metadata.
- `ORDER_BOOKING_WORK_PROCESS.md` / `MASTER_BLUEPRINT_V3.md` do not reflect current schema.
- `openapi.json` may lag the Express API.
- A `develop` branch may not exist.
- AI features described in architecture docs may be unimplemented.
- Not all routes in `src/api/server.ts` are authenticated.

## Documentation Hierarchy

1. `PROJECT_CONSTITUTION.md` — product identity & principles
2. `CURRENT_STATE.md` — verified repository reality
3. `ARCHITECTURE.md` — architecture as built
4. `docs/AI/ENGINEERING_INSTRUCTIONS.md` — engineering process & invariants
5. `docs/adr/` — accepted architectural decisions
6. `docs/` — current documentation (`CANONICAL` defines behavior)
7. `docs/work-in-progress/`, drafts — non-authoritative
8. `docs/legacy/`, archived — historical

Do not delete or move legacy documents. Add classification notes instead. Do not rewrite historical mission reports.

## Quick Reference

| Concern | Location |
|---|---|
| Database schema | `prisma/schema.prisma` |
| Backend entry | `src/api/server.ts` |
| Frontend entry | `src/client/App.tsx` |
| Auth middleware | `src/api/middleware/authMiddleware.ts` |
| Order abstraction | `src/api/services/orders/` |
| Accounting | `src/api/services/AccountingService.ts`, `JournalEntryService.ts` |
| Provisioning / owner invites | `src/api/services/onboarding/`, `src/api/routes/superAdminRoutes.ts` |
| Supabase admin ports | `src/api/services/platform/SupabaseAdminService.ts` |
| Socket client | `src/shared/lib/socketClient.ts` |
| Types | `src/shared/types.ts` |
| Env config | `src/config/env.ts` |
| Electron | `electron-main.cjs`, `electron/main.ts` |
| AI assistant | `src/operations/dashboard/AURAAssistant.tsx` |

Last updated: 2026-08-23
