# FireFlow — Agent Context

## Purpose

This file orients AI agents on the canonical truths of the FireFlow project.
It is the single entry point for understanding what FireFlow is, what it does, and how it is built.

For detailed state, see `CURRENT_STATE.md`.
For architecture details, see `ARCHITECTURE.md`.
For product principles, see `PROJECT_CONSTITUTION.md`.

---

## Source Priority

When information conflicts, use this order:

1. Explicit current founder/product decisions (this file, `PROJECT_CONSTITUTION.md`, `CURRENT_STATE.md`)
2. Verified current repository behavior (code, database schema, running system)
3. Accepted architectural decisions (`docs/adr/`)
4. Current domain specifications (`ARCHITECTURE.md`, `CURRENT_STATE.md`)
5. Existing canonical documentation
6. Historical/legacy documents (`docs/legacy/`)

Never silently resolve a serious contradiction.
If something cannot be established, mark it UNKNOWN and report it.

---

## Product Truth

FireFlow is an AI-native Business Operating System initially focused on the restaurant vertical.

The existing restaurant operational system is FireFlow's foundation:
POS, orders, kitchen display, inventory, accounting, delivery, tenant management, and website/ordering capabilities.

AI is an intelligence/assistance layer over deterministic business systems.
AI must NOT become the authority for financial integrity, permissions, security, or other deterministic business rules.

The system should remain modular and provider-independent.

---

## Critical Rules

1. **Hybrid Awareness**: Operational data (orders, kitchen, inventory) runs on local PostgreSQL via Express API. SaaS data (licenses, subscriptions, payments) uses Supabase cloud via `cloudClient.ts`.
2. **Branding**: Maintain "Fireflow Restaurant" for tenants; "Powered by Fireflow" is the SaaS provider badge.
3. **No destructive refactors**: `src/api/server.ts` is the core local operations entry point. Do not touch it unless fixing bugs.
4. **Financial Authority**: Backend is the source of truth for all financial calculations, order totals, tax, and service charge. Frontend may preview but never override.
5. **Tenant Isolation**: Every data mutation must enforce `restaurant_id` from authenticated context, never from client input.
6. **AI Boundaries**: AI may recommend, summarize, and assist. AI may never approve financial transactions, override permissions, or bypass security controls.
7. **Documentation**: Do not delete or move legacy documents. Add classification notes instead.

---

## What NOT to Assume

- Do not assume old `.md` files in `docs/` are current. Many are historical.
- Do not assume `ORDER_BOOKING_WORK_PROCESS.md` or `MASTER_BLUEPRINT_V3.md` reflect current schema.
- Do not assume `openapi.json` matches the current Express API.
- Do not assume the `develop` branch exists or is the working branch.
- Do not assume AI features described in architecture docs are implemented.
- Do not assume all routes in `src/api/server.ts` are authenticated.

---

## Documentation Hierarchy

1. `PROJECT_CONSTITUTION.md` — Product identity & principles
2. `CURRENT_STATE.md` — Verified repository reality
3. `ARCHITECTURE.md` — Architecture as built
4. `docs/adr/` — Accepted architectural decisions
5. `docs/` — Current documentation
6. `docs/legacy/` — Historical/contradicted documents

---

## Quick Reference

| Concern | Location |
|---|---|
| Database schema | `prisma/schema.prisma` |
| Backend entry | `src/api/server.ts` |
| Frontend entry | `src/client/App.tsx` |
| Auth middleware | `src/api/middleware/authMiddleware.ts` |
| Order abstraction | `src/api/services/orders/` |
| Accounting | `src/api/services/AccountingService.ts`, `JournalEntryService.ts` |
| Socket client | `src/shared/lib/socketClient.ts` |
| Types | `src/shared/types.ts` |
| Env config | `src/config/env.ts` |
| Electron | `electron-main.cjs`, `electron/main.ts` |
| AI assistant | `src/operations/dashboard/AURAAssistant.tsx` |

---

Last updated: 2026-08-16
