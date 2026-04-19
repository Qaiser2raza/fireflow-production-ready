# FireFlow: Agent Context & System Guide

Welcome to FireFlow. This document provides essential context for AI agents working on this project. **Update this file after every session.**

---

## Project Overview
FireFlow is a unified POS, KDS, and Logistics platform for modern restaurants. It handles the full lifecycle of an order from initial cart creation through kitchen preparation and delivery dispatch.

---

## Core Workflows (Uniform Path)
All order types (`DINE_IN`, `TAKEAWAY`, `DELIVERY`) follow these identical initial steps:
1. **Cart Creation**: Items are added to the cart in `POSView.tsx`.
2. **Firing**: When the agent clicks "Fire", the `OrderWorkflowService.fireOrderToKitchen` is called.
3. **Item Transition**: Items move from `DRAFT` -> `PENDING`.
4. **KDS Entry**: Items appear in the KDS (Master or Station-specific) for preparation.
5. **KDS Done**: Once marked "Done" in KDS, items move to `DONE`.

---

## Order Types & Post-KDS Flow
- **DINE_IN**: Items are served. Settlement happens at the table or POS via `PaymentModal`.
- **TAKEAWAY**: Items are packed. Settlement happens at the POS via `PaymentModal`.
- **DELIVERY**: When all items are `DONE`, the order automatically transitions to `READY` status. It then appears in the **Logistics Hub** for driver assignment.

---

## Critical Terminology
- **MASTER KDS**: The "ALL" station view in the KDS, typically used by Cashiers or Head Chefs to see the "Big Picture".
- **READY Status**: Specifically used for Delivery orders to signify they are prepared and waiting for a driver.
- **ACTIVE Status**: The base status for an open order (replaces "DRAFT" in v3.0).

---

## Tech Stack
- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS v4
- **Backend**: Node.js + Express + Prisma ORM
- **Database**: PostgreSQL (local via `fireflow_local`)
- **Real-time**: Socket.IO for live KDS/Logistics/Floor updates
- **Desktop**: Electron wrapper for local deployment

---

## Key File Map

| Concern | File |
|---------|------|
| Root UI shell + Socket listeners | `src/client/App.tsx` |
| App context definition | `src/client/contexts/AppContext.tsx` |
| All context field types | `src/shared/types.ts` (~line 540) |
| Auth-aware fetch | `src/shared/lib/authInterceptor.ts` → `fetchWithAuth()` |
| Cashier session open/close UI | `src/operations/pos/components/CashSessionModal.tsx` |
| Rider dispatch + settlement | `src/operations/logistics/LogisticsHub.tsx` |
| Manual journal entry UI | `src/operations/finance/components/ManualJournalEntryModal.tsx` |
| Cashier session service | `src/api/services/finance/CashierSessionService.ts` |
| Double-entry journal service | `src/api/services/JournalEntryService.ts` |
| Chart of Accounts API | `src/api/routes/coaRoutes.ts` |
| Cashier API routes | `src/api/routes/cashierRoutes.ts` |

---

## Important Station IDs
- **Master (ALL)**: Used for high-level oversight.
- **BBQ**: `ff42c8f0-035c-4648-a813-a3201a54ec70`
- **Kitchen**: `440097c5-559d-4735-8022-ed3847e704de`

---

## Accounting / Finance Rules
- **Double-entry bookkeeping is enforced.** All cashier session closures generate journal entries via `JournalEntryService.recordSessionCloseJournal()`.
- GL Account codes in use:
  - `1001` — Cash / Main Till
  - `1090` — Manager Drawing / Cash in Transit
  - `4030` — Misc Income (Overages)
  - `5030` — Shortage Expense
- `JournalEntryService` must be imported with **dynamic `import()`** inside `CashierSessionService` to avoid circular dependency errors.
- COA API `/api/accounting/coa` returns `{ success: true, accounts: Account[] }` — a **flat array** with `parent_id` and `depth` fields, NOT a nested tree.

---

## Redundancy Controls
- `debouncedFetchInitialData` is defined in `AppProvider` (App.tsx ~line 236) and exposed on the context **as `fetchInitialData`**.
- In `AppContent` and all child components, always use `fetchInitialData` from `useAppContext()` — never reference `debouncedFetchInitialData` directly (it is out of scope).

---

## Real-time Sync
- Supabase Realtime listeners are in `App.tsx` > `handleDbChange()`.
- Tables currently listened to: `orders`, `staff`, `tables`, `menu_items`, `rider_shifts`, `cashier_sessions`.
- **When adding a feature with a new DB table, always add a listener in `handleDbChange`.**

---

## ⚠️ Critical Rules — Read Before Every Change

### React / Hooks
- **NEVER call `useMemo`, `useEffect`, or any hook inside JSX `{...}` blocks.** They must be at the top level of the component function. This is the single most common Flash/GPT mistake and causes a **500 error**.
- **Avoid object dependencies in `useEffect`.** Use stable primitives (like `user.id` or `restaurant_id`) instead of the whole object. Object references change on every context re-render, causing unnecessary effect re-fires.
- **Always ensure `useEffect` returns a cleanup function.** Avoid early `return` guards *inside* the effect that skip the cleanup logic.
- Always check JSX nesting depth when editing large components (e.g., `LogisticsHub.tsx`). A mismatched `</div>` will break the entire tree.

### API Polling
- **Use `intervalRef` for intervals.** Store the interval ID in a `useRef` and clear it before starting a new one and in the cleanup function.
- **Throttle appropriately.** Analytics should poll every 30–60s. Real-time features should use Socket.IO.
- **Check visibility.** Only poll when `document.visibilityState === 'visible'` to save resources.

### Imports
- **Always import `useAppContext` from `../../client/contexts/AppContext`** — NOT from `App.tsx`. Importing from `App.tsx` creates a circular dependency.
- **Always count directory depth carefully:**
  - `src/operations/pos/components/` → `../../../client/` (3 levels up to `src/`)
  - `src/operations/logistics/` → `../../client/` (2 levels up to `src/`)
  - `src/operations/finance/components/` → `../../../client/` (3 levels up)

### Null Safety
- `currentUser` is typed as `Staff | null`. Always guard with `if (!currentUser) return;` before accessing `.id` or `.restaurant_id`.
- `activeSession` is `any | null`. Guard before accessing `.id` in session-dependent operations.

### Service Layer
- In `CashierSessionService.closeSession`, always store the Prisma result first: `const updated = await prisma.update(...)` — then run side effects (journaling etc.) — then `return updated`. Using `return await prisma.update()` makes all code after it **unreachable dead code**.

### API Calls
- Use `fetchWithAuth()` from `authInterceptor.ts` for all authenticated API calls.
- `CashSessionModal.tsx` is pre-auth UI and uses raw `fetch()` — this is intentional.

### Styling
- Design system: dark slate (`#020617` bg, `#0f172a` cards, `#1e293b` inputs, `#334155` borders).
- Primary: indigo. Success: emerald. Warning: amber. Error: red.
- LogisticsHub uses BEM-like `lh-` CSS class prefixes (defined inline in the component's `<style>` tag or external CSS).

---

## Current Feature State (as of 2026-04-16)

| Feature | Status |
|---------|--------|
| POS (orders, payment, receipt) | ✅ Stable |
| KDS (item tracking, optimistic UI) | ✅ Stable |
| Floor / Dine-In management | ✅ Stable |
| Logistics Hub (dispatch, settle, audit) | ✅ Stable |
| Cashier Session Modal (open/close/reconcile) | ✅ New — Stable |
| Manager Handover Journaling | ✅ New — Stable |
| Finance Hub (COA, manual journal entry) | ✅ Stable |
| FBR Tax Integration | ✅ Stable |
| Staff / Menu / Customer Management | ✅ Stable |
| Riders do NOT have app access | ⚠️ Cashier must use "Mark Delivered" manually |

---

## Session Log

### 2026-04-16 — Logistics Audit & Cashier Stabilization
**Implemented:**
- `rider_shifts` socket listener in `App.tsx`
- Logistics Shift Audit Trail (all orders per shift in SETTLE tab)
- "Mark Delivered" cashier action in MONITOR tab
- Shift Reconciliation Summary (Float + Sales - Drops = Net Due)
- `CashSessionModal.tsx` — professional open/close session UI replacing `prompt()`
- `JournalEntryService.recordSessionCloseJournal()` — double-entry on session close
- COA API response standardized to `{ success, accounts }`
- `ManualJournalEntryModal` — fixed account loading and hierarchical dropdown

**Bugs fixed (introduced by Gemini Flash):**
- `useMemo` inside JSX return → moved to component top level
- Extra `</div>` in LogisticsHub settle section → fixed nesting
- Wrong import depth `../../` → `../../../` in `CashSessionModal`
- `return await prisma.update()` making journaling unreachable → fixed as `const updated = await`
- Circular import `CashSessionModal → App.tsx` → fixed to `contexts/AppContext`
- Unused: `Decimal`, `fetchInitialData`, `setNotes`, `openSession`, `closeSession`, `completeDelivery`, `setTick`
- `debouncedFetchInitialData` ref in `AppContent` (out of scope) → fixed to `fetchInitialData`
- `currentUser` null safety in `CashSessionModal` handlers

**TypeScript result:** `npx tsc --noEmit` → **exit code 0** ✅

### April 17, 2026 Session 
- **Goal:** Correct KDS optimistic undo loop, Logistics delivery assignment tracking, and Auto-Print Bill workflow
- Analyzed `OrderWorkflowService.fireOrderToKitchen` which bypassed Takeaway extension creation when order was in `DRAFT`. We now set `orders.status` to `ACTIVE` internally upon fire.
- KDS Undo `handleUndo` loop sent EXACT prior states to backend (e.g. `PREPARING` back to `PENDING`), preventing validation. `validTransitions` array in `OrderWorkflowService` loosened to allow strict backward `ItemStatus` reversion.
- Corrected Prisma bug in `deliveryRoutes.ts` where arrays were treated as dicts causing crashes on `mark-delivered` calculation.
- Migrated LogisticsHub Riders Dispatch UI:
  - Scrapped raw string-based `handlePrintRiderSlip` HTML receipt generation.
  - Implemented queued `<ReceiptPreviewModal autoPrint={true} />` iterating over `receiptPrintQueue` to perfectly mirror POS Bill logic inside Logistics Hub automatically on dispatch.
  - Added "Edit in POS" and "View Details" (via isolated Modal) actionable buttons natively into Logistics Pending Dispatch and Active Runs tables bridging cross-hub workflows.

### 2026-04-18 — Analytics Polling Optimization
**Implemented:**
- Fixed duplicate `/api/analytics/summary` calls in `DashboardView.tsx`.
- Swapped unstable object dependency `[currentUser]` for stable primitive `[currentUser?.restaurant_id]`.
- Replaced broken `hasInitiallyFetched` guard with robust `useEffect` cleanup pattern.
- Implemented `intervalRef` for safer interval management.
- Throttled analytics polling to 45s (previously 15s).
- Added visibility-based pausing (polling stops when tab is hidden).
- Wrapped `fetchAnalytics` in `useCallback` to prevent unnecessary effect re-triggers.

### 2026-04-18 — Logistics Hub Bug Fixes
**Bugs Fixed:**
- **URL Mismatch (Critical):** `LogisticsHub.tsx` `handleMarkDelivered()` was calling `/api/orders/:id/deliver` which does not exist. The correct backend route is `/api/orders/:id/mark-delivered`. Every click on the "Delivered" button was silently 404-ing.
- **Empty-Array Truthy Crash (Backend):** In `deliveryRoutes.ts`, `assign-driver` and `mark-failed` routes had `if (order.delivery_orders)` which is always truthy for an empty array `[]`. The subsequent Prisma `.update()` crash-burned if no `delivery_orders` DB record existed. Fixed with `.length > 0` guard.
- **Strict Status Comparison (Backend):** `OrderWorkflowService.syncOrderStatus()` used `order.status === 'ACTIVE'` — strict equality. Now normalized to `.trim().toUpperCase()` and expanded to include `DRAFT` status so orders are never stuck in Dispatch limbo.
- **Silent 404 Error (Frontend):** Added `res.ok` guard in `handleMarkDelivered()` before calling `res.json()` to surface readable errors instead of `Unexpected token < in JSON`.

**Files Changed:**
- `src/operations/logistics/LogisticsHub.tsx` — URL fix + `res.ok` guard
- `src/api/routes/deliveryRoutes.ts` — `delivery_orders.length > 0` guard (x2)
- `src/api/services/OrderWorkflowService.ts` — normalized status comparison

---

## Common Commands

```bash
npm run dev          # Start Vite frontend dev server
npm run server       # Start Express API server (port 3001)
npx tsc --noEmit     # TypeScript check (must be exit 0)
npm run seed:coa     # Seed Chart of Accounts GL accounts
npm run kill:3001    # Kill port 3001 if stuck
npm run db:reset-orders  # Reset orders for testing
```
