# Fireflow — AI Agent Context File
> Last Updated: 2026-04-16 | By: Claude Sonnet (Post-review of Gemini Flash session)

This document is the single source of truth for any AI agent (Claude, Gemini, ChatGPT, etc.) working on this codebase. Read this FIRST before making any changes.

---

## 🏗️ Project Overview

**Fireflow** is a full-stack **Restaurant Management System** built with:
- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS v4
- **Backend**: Express.js + Prisma ORM + PostgreSQL
- **Real-time**: Socket.IO (server push to all clients on DB changes)
- **Auth**: Custom session-based with bcrypt PINs
- **Deployment**: Electron desktop app + browser access on LAN

---

## 🗂️ Directory Structure (Key Paths)

```
src/
├── client/
│   ├── App.tsx                         # Root provider + AppContent UI shell
│   ├── contexts/AppContext.tsx          # Context definition (DO NOT import from App.tsx directly)
│   └── RestaurantContext.tsx
├── operations/
│   ├── pos/
│   │   ├── POSView.tsx
│   │   └── components/
│   │       └── CashSessionModal.tsx    # Cashier session open/close modal
│   ├── logistics/
│   │   └── LogisticsHub.tsx            # Rider dispatch, monitoring, settlement
│   ├── finance/
│   │   ├── FinancialCommandCenter.tsx
│   │   └── components/
│   │       └── ManualJournalEntryModal.tsx
│   ├── kds/KDSView.tsx
│   └── dashboard/DashboardView.tsx
├── api/
│   ├── server.ts                       # Express entry point
│   ├── routes/
│   │   ├── cashierRoutes.ts            # /api/cashier (open, close, summary)
│   │   ├── coaRoutes.ts                # /api/accounting/coa
│   │   └── ...
│   └── services/
│       ├── finance/
│       │   ├── CashierSessionService.ts
│       │   └── JournalEntryService.ts  # Has recordSessionCloseJournal()
│       ├── AccountingService.ts
│       └── ...
├── shared/
│   ├── types.ts                        # AppContextType (check here for all context fields)
│   └── lib/
│       └── authInterceptor.ts          # fetchWithAuth() - use for all API calls
```

---

## ⚠️ Critical Rules for AI Agents

### 1. React / TypeScript
- **NEVER call hooks inside JSX returns** — `useMemo`, `useEffect`, `useCallback` must be at the top level of the component function only.
- **Always import `useAppContext` from `../../client/contexts/AppContext`** — NOT from `App.tsx` (circular dependency).
- **Always check the number of path levels** when writing imports. Count from the file's location:
  - `src/operations/pos/components/` → needs `../../../client/` (3 levels up)
  - `src/operations/logistics/` → needs `../../client/` (2 levels up)
- **`currentUser` is `Staff | null`** — always guard with `if (!currentUser) return;` before accessing `.id` or `.restaurant_id`.
- Run `npx tsc --noEmit` after every major change. Zero errors is the standard.

### 2. API Calls
- Always use `fetchWithAuth()` from `src/shared/lib/authInterceptor.ts` for API calls — NOT raw `fetch()`. CashSessionModal is an exception since it's pre-auth.
- All API responses must follow `{ success: boolean, data?: any, error?: string }` shape.
- The COA endpoint (`/api/accounting/coa`) returns `{ success: true, accounts: Account[] }` — a flat array, NOT a nested tree.

### 3. Socket / Real-time
- Real-time updates come via Supabase Realtime listeners in `App.tsx` > `handleDbChange()`.
- Tables listened to: `orders`, `staff`, `tables`, `menu_items`, `rider_shifts`, `cashier_sessions`.
- When adding a new feature with a new DB table, add a listener in `handleDbChange`.

### 4. Accounting / Finance
- **Double-entry bookkeeping is enforced** — all session closes generate journal entries via `JournalEntryService.recordSessionCloseJournal()`.
- GL Account codes in use: `1001` (Cash/Till), `1090` (Manager Drawing), `4030` (Misc Income / Overage), `5030` (Shortage Expense).
- `JournalEntryService` must be imported with dynamic `import()` inside `CashierSessionService` to avoid circular dependencies.

### 5. Styling
- Design system: dark slate (`#020617` bg, `#0f172a` cards, `#1e293b` inputs).
- Primary accent: indigo. Success: emerald. Warning: amber. Error: red.
- Component-scoped CSS classes use BEM-like prefixes (e.g., `lh-` for LogisticsHub).

---

## 📋 Current Feature State (as of 2026-04-16)

### Working & Stable ✅
- POS (Orders, Payment, Receipt printing)
- KDS (Kitchen Display, item status tracking, optimistic UI)
- Floor Management (Dine-in, table seating, party management)
- Logistics Hub (Rider dispatch, shift management, settlement, audit trail)
- Finance Hub (Chart of Accounts, Manual Journal Entry, Reports)
- Cashier Session Modal (Open/Close with reconciliation + manager handover journaling)
- FBR Integration (Tax receipts)
- Staff Management
- Menu Management
- Customer Management

### Known Limitations ⚠️
- Riders do NOT have app access — cashiers must manually "Mark Delivered" for them
- `rider_shifts.opened_at` column must exist in DB for audit trail filtering
- The `1090 - Manager Drawing` GL account must be seeded via `npm run seed:coa`

### Recently Completed Work (Session: 2026-04-16)
1. **Cashier Session Modal** — `CashSessionModal.tsx` replaces browser `prompt()` dialogs
2. **Logistics Audit Trail** — Full shift order history in Settle tab
3. **Manager Handover Journaling** — `recordSessionCloseJournal` in `JournalEntryService`
4. **COA API standardization** — Wrapped in `{ success, accounts }`
5. **ManualJournalEntryModal** — Fixed account loading + hierarchical indentation

---

## 🐛 Known Gotchas (Lessons Learned)

| Gotcha | Detail |
|--------|--------|
| `useMemo` in JSX | Flash put it inside `{...}` in return — causes 500. Always hoist to component top. |
| CashSessionModal import depth | File is 3 levels deep. Needs `../../../client/contexts/AppContext`. |
| `CashierSessionService.closeSession` | Must use `const updated = await prisma.update()` — NOT `return await` — or the journaling code is unreachable. |
| `AppContextType` fields | Check `src/shared/types.ts` line ~540 for all available context fields before destructuring. |
| `debouncedFetchInitialData` | Only in scope inside `AppProvider`. In `AppContent`, it's accessed as `fetchInitialData` from context. |
| Emoji in source files | Causes encoding issues with file edit tools. Use PowerShell `(Get-Content ... -Raw) -replace` for those lines. |

---

## 🔧 Common Commands

```bash
# Start dev server (frontend)
npm run dev

# Start API server
npm run server

# TypeScript check (must be zero errors)
npx tsc --noEmit

# Seed Chart of Accounts
npm run seed:coa

# Kill port 3001
npm run kill:3001
```

---

## 📁 Related Files for Common Tasks

| Task | Files to Touch |
|------|----------------|
| Add new API endpoint | `src/api/routes/*.ts` + register in `src/api/server.ts` |
| Add real-time sync for new table | `src/client/App.tsx` > `handleDbChange()` |
| Add new GL account | `prisma/seed.ts` + `scripts/seed-coa.ts` |
| New cashier action | `src/api/routes/cashierRoutes.ts` + `CashierSessionService.ts` |
| New report | `src/api/services/reports/` + `src/operations/reports/ManagementReports.tsx` |
