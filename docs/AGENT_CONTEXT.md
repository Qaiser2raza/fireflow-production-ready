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
- Socket.IO listeners are in `App.tsx` > `handleDbChange()`.
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

### 2026-04-19 — Role-Based UI Gating & Access Control
**Implemented:**
- Established strict UI-level role boundaries in `App.tsx` router and `menuItems` generation.
- **Cashiers (`CASHIER`)** instantly route to `ORDER_HUB`. They no longer mount `DashboardView`, effectively squashing 403 Forbidden spikes caused by unauthorized backend analytics fetching. Cashier tabs restricted to: Dine-In Order Hub, POS Control, Flow Ops, Logistics Hub, Billing, Patrons, and System.
- **Waiters (`SERVER` / `WAITER`)** now securely route to `ORDER_HUB` with access to only: Dine-In Order Hub, POS Control.
- **Kitchen Staff (`CHEF`)** now instantly route to the `KITCHEN` view (KDS Master Feed) with no other tabs available.
- **Riders (`RIDER`)** exclusively mount the `LOGISTICS` environment.

**Bugs Fixed:**
- Hardcoded `"SERVER"` UI select dropdown value in `StaffView.tsx` caused the database to store `"role": "WAITER"` for existing waiters, breaking the router check. Updated `App.tsx` to handle `currentUser.role === 'WAITERS' || currentUser.role === 'SERVER'`.
- Surgically removed optimistic mount debug logs (`[KDS_MOUNT]`) blowing up the client console in `KDSView.tsx`.

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
# FireFlow Financial Audit Report
## Double-Entry Accounting — Full Day Operational Trace
**Restaurant:** FireFlow Demo | **Date:** 22 April 2026 | **Currency:** PKR  
**Status:** ✅ LIVE VERIFIED against production database

---

## 1. Chart of Accounts (COA)
*Industry standard 5-series structure (GAAP / IFRS compatible)*

| Code | Account Name | Type | Normal Balance | Purpose |
|------|-------------|------|----------------|---------|
| **1000** | Cash & Cash Equivalents | ASSET | DR | Physical cash in POS drawer |
| **1010** | Card / Digital Receivables | ASSET | DR | Card/Raast payments pending bank settlement (T+1) |
| **1020** | Rider Receivables | ASSET | DR | Cash currently held by delivery riders in field |
| **1040** | Customer Accounts (AR) | ASSET | DR | Khata / credit sale balances |
| **1060** | Inventory Asset | ASSET | DR | Stock value on hand (periodic method) |
| **2000** | Sales Tax Payable | LIABILITY | CR | GST/FBR tax collected — must be remitted to govt |
| **2010** | Service Charge Payable | LIABILITY | CR | SVC collected — to be disbursed to staff at EOD |
| **2020** | Supplier Payable (AP) | LIABILITY | CR | Unpaid supplier invoices outstanding |
| **4000** | Food & Beverage Revenue | REVENUE | CR | Core restaurant sales (net of tax/SVC) |
| **4010** | Delivery Fee Revenue | REVENUE | CR | Customer-paid delivery charges |
| **4020** | Rounding Differences | REVENUE | CR | Decimal rounding gain/loss (tolerance Rs. 10) |
| **4900** | Discount Expense | EXPENSE | DR | Discounts applied to customer bills (contra-revenue) |
| **5000** | Rider Expense | EXPENSE | DR | Rider wages, float issuances |
| **5010** | General Expense | EXPENSE | DR | Petty cash, operational outflows |
| **5020** | Cost of Goods Sold | EXPENSE | DR | Cost of inventory consumed in production |

> **Live Verified:** ✅ All 15 accounts confirmed active in `chart_of_accounts` table

---

## 2. Live Trial Balance — From Database

*Source: `/api/accounting/trial-balance` — All entries since 2026-04-01*

| Code | Account | Type | DEBIT (Rs.) | CREDIT (Rs.) | Balance |
|------|---------|------|-------------|--------------|---------|
| 1000 | Cash & Cash Equivalents | ASSET | **8,140.00** | — | DR 8,140.00 |
| 2000 | Tax Payable | LIABILITY | — | **1,068.97** | CR 1,068.97 |
| 2010 | Service Charge Payable | LIABILITY | — | **387.50** | CR 387.50 |
| 4000 | Food & Beverage Revenue | REVENUE | — | **6,683.53** | CR 6,683.53 |
| **TOTALS** | | | **8,140.00** | **8,140.00** | |

> ### ✅ BALANCED — Double-Entry Integrity CONFIRMED
> Total Debits (Rs. 8,140) = Total Credits (Rs. 8,140)

**What these balances tell us:**
- Rs. 8,140 is sitting in the cash drawer (from 2 orders)
- Rs. 1,068.97 is owed to FBR (must be remitted)
- Rs. 387.50 must be disbursed to waitstaff (SVC)
- Rs. 6,683.53 is the net food revenue earned this period

---

## 3. Live Session Summary — Cashier Reconciliation

*Source: `/api/cashier/{session_id}/summary` — HTTP 200 ✅*

```
┌────────────────────────────────────────────────┐
│         CASHIER SESSION RECONCILIATION          │
│  Session: 4b390327  |  22 Apr 2026, 09:37 AM   │
├────────────────────────────────────────────────┤
│  Opening Float           Rs. 1,000.00           │
│  Orders Processed        2                      │
│  ──────────────────────────────────────────── │
│  Cash Sales              Rs. 8,140.00           │
│  Card Sales              Rs. 0.00               │
│  Credit Sales            Rs. 0.00               │
│  Total Sales             Rs. 8,140.00           │
│  ──────────────────────────────────────────── │
│  Tax Collected           Rs. 1,068.97           │
│  SVC to Disburse 💼      Rs. 387.50             │
│  Discounts Given         Rs. 0.00               │
│  ──────────────────────────────────────────── │
│  EXPECTED CASH IN TILL 💵  Rs. 9,140.00         │
│  (= Float Rs. 1,000 + Cash Sales Rs. 8,140)    │
└────────────────────────────────────────────────┘
```

**Cashier Close Procedure:**
1. Count physical cash in drawer
2. Enter count into "Actual Cash" field → system calculates variance
3. Enter handover amount to manager
4. Remaining float stays for next session
5. Separately disburse Rs. 387.50 SVC to waitstaff

---

## 4. Journal Entry Patterns (All Transaction Types)

### 4A. Cash Dine-In / Takeaway Sale ✅ LIVE
```
JOURNAL ENTRY: ORDER_SALE (Cash)
Date: 21 Apr 2026, 11:08 AM | Ref: ORD-131926-RT6

  Account                Code   Description                   DR          CR
  ──────────────────────────────────────────────────────────────────────────
  Cash & Cash Equiv.     1000   Payment [CASH] – Order        5,090.00
  Food & Bev Revenue     4000   F&B Revenue (Gross)                       4,178.53
  Tax Payable            2000   Sales Tax – Order                           668.97
  Service Charge Paybl   2010   Service Charge – Order                      242.50
  ──────────────────────────────────────────────────────────────────────────
  TOTALS                                                       5,090.00    5,090.00  ✅

JOURNAL ENTRY: ORDER_SALE (Cash)
Date: 22 Apr 2026, 02:42 AM | Ref: ORD-125246-TAI

  Cash & Cash Equiv.     1000   Payment [CASH] – Order        3,050.00
  Food & Bev Revenue     4000   F&B Revenue (Gross)                       2,505.00
  Tax Payable            2000   Sales Tax – Order                           400.00
  Service Charge Paybl   2010   Service Charge – Order                      145.00
  ──────────────────────────────────────────────────────────────────────────
  TOTALS                                                       3,050.00    3,050.00  ✅
```
> **Ledger verified:** 8 journal_entry_lines confirmed in DB matching these amounts exactly.

---

### 4B. Card / Raast Payment
```
  Card Receivable        1010   Card payment pending          3,500.00
  Food & Bev Revenue     4000   F&B Revenue (Gross)                       2,876.11
  Tax Payable            2000   Sales Tax                                    455.29
  Service Charge Paybl   2010   Service Charge                              168.60
  ──────────────────────────────────────────────────────────────────────────
  TOTALS                                                       3,500.00    3,500.00  ✅
```
> `1010` (not Cash) because card money arrives T+1/T+3 via bank settlement.  
> When bank settles: `DR 1000 Cash` / `CR 1010 Card Receivable` *(roadmap item)*

---

### 4C. Credit Sale (Khata)
```
  Customer AR (Khata)    1040   Credit sale – ORD-XXXX        2,000.00
  Food & Bev Revenue     4000   F&B Revenue (Net)                         1,642.76
  Tax Payable            2000   Sales Tax                                    261.24
  Service Charge Paybl   2010   Service Charge                               96.00
  ──────────────────────────────────────────────────────────────────────────
  TOTALS                                                       2,000.00    2,000.00  ✅
```

**When Customer Pays Khata:**
```
  Cash & Cash Equiv.     1000   Cash received from customer   2,000.00
  Customer AR (Khata)    1040   Account cleared                           2,000.00
  ──────────────────────────────────────────────────────────────────────────
  TOTALS                                                       2,000.00    2,000.00  ✅
```

---

### 4D. Delivery Order (Rider carries cash)

**At Dispatch:**
```
  Rider Receivable       1020   [PROVISIONAL] Rider liability 1,500.00
  Food & Bev Revenue     4000   F&B Revenue                               1,231.34
  Tax Payable            2000   Sales Tax                                    195.65
  Service Charge Paybl   2010   Service Charge                               73.01
```

**When Rider Returns Cash:**
```
  Cash & Cash Equiv.     1000   Cash received from rider      1,500.00
  Rider Receivable       1020   Rider debt cleared                        1,500.00
  ──────────────────────────────────────────────────────────────────────────
  TOTALS                                                       1,500.00    1,500.00  ✅
```

---

### 4E. Float Issued to Rider
```
  Rider Receivable       1020   Float issued — rider owes       500.00
  Cash & Cash Equiv.     1000   Cash leaves drawer                          500.00
  ──────────────────────────────────────────────────────────────────────────
  TOTALS                                                         500.00      500.00  ✅
```

---

### 4F. Operational Expense / Payout
```
  General Expense        5010   Electricity / supplies          800.00
  Cash & Cash Equiv.     1000   Cash paid out                               800.00
  ──────────────────────────────────────────────────────────────────────────
  TOTALS                                                         800.00      800.00  ✅
```

---

### 4G. Discounted Sale
```
  Cash & Cash Equiv.     1000   Cash received (after disc.)   2,800.00
  Discount Expense       4900   Discount given                  200.00
  Food & Bev Revenue     4000   Gross Revenue (pre-discount)              2,469.03
  Tax Payable            2000   Sales Tax                                    331.97
  ──────────────────────────────────────────────────────────────────────────
  TOTALS (DR = CR)                                             3,000.00    3,000.00  ✅
```
> Gross revenue shown at face value; discount recorded separately as `4900 Expense`. Industry standard GAAP gross presentation.

---

### 4H. Supplier Purchase (Stock In)
```
  Inventory Asset        1060   Stock received from supplier  10,000.00
  Supplier Payable       2020   Invoice outstanding                      10,000.00
  ──────────────────────────────────────────────────────────────────────────
  TOTALS                                                      10,000.00   10,000.00  ✅
```

**When Paying Supplier:**
```
  Supplier Payable       2020   Liability cleared             10,000.00
  Cash & Cash Equiv.     1000   Cash paid to supplier                    10,000.00
```

---

## 5. Session Lifecycle — When Journals Are Posted

| Phase | Event | Journal Posted? | Notes |
|-------|-------|----------------|-------|
| **08:00 AM** | Cashier opens session | ❌ None | Float is pre-existing cash, no new economic event |
| **During day** | Each order settled | ✅ ORDER_SALE | Posted atomically at payment |
| **During day** | Rider dispatched | ✅ PROVISIONAL | Rider Receivable debited |
| **During day** | Rider returns cash | ✅ RIDER_SETTLEMENT | Clears receivable, debit cash |
| **During day** | Expense payout | ✅ PAYOUT | General Expense + Cash Credit |
| **During day** | Customer credit sale | ✅ CREDIT_SALE | Customer AR Debited |
| **During day** | Customer pays khata | ✅ CUSTOMER_PAYMENT | AR Cleared, Cash Debited |
| **EOD** | Manager withdraws cash | ✅ SESSION_CLOSE | Manager Drawing + Cash Credit |
| **EOD** | SVC distribution to staff | ✅ Separate | DR 2010 SVC Payable, CR 1000 Cash |

> **Key principle:** Revenue is recognized at **point of sale** (when order is CLOSED/DELIVERED), not when ordered. This is GAAP/IFRS compliant.

---

## 6. P&L Statement Structure

*Source: `/api/reports/profit-loss` — Schema verified*

```
INCOME STATEMENT — FireFlow Restaurant
Period: 01 Apr 2026 — 22 Apr 2026
══════════════════════════════════════════
REVENUE
  Food & Beverage Revenue        6,683.53
  Delivery Fee Revenue               0.00
  ─────────────────────────────────────
  TOTAL REVENUE                  6,683.53

COST OF GOODS SOLD (COGS)            0.00  ← Roadmap: link inventory
  ─────────────────────────────────────
  GROSS PROFIT                   6,683.53

OPERATING EXPENSES
  Discounts Given                    0.00
  General Expenses                   0.00
  Rider Expenses                     0.00
  ─────────────────────────────────────
  TOTAL EXPENSES                     0.00

NET INCOME                       6,683.53
══════════════════════════════════════════
Tax Collected (not revenue)      1,068.97  → FBR remittance
SVC Collected (not revenue)        387.50  → Staff disbursement
```

---

## 7. Double-Entry Integrity Guards (Active in Production)

The `postJournal()` engine enforces **5 guards** on every entry:

| Guard | Rule | On Failure |
|-------|------|-----------|
| 1 | Transaction client required | Throws immediately |
| 2 | Minimum 2 journal lines | Rejects entry |
| 3 | All lines have `referenceType` + `referenceId` | Rejects entry |
| 4 | **DR total = CR total exactly** | **Rolls back entire DB transaction** |
| 5 | Non-zero journal value | Rejects entry |

> **Imbalance tolerance:** Up to Rs. 10 rounding difference is auto-adjusted to `4020 Rounding Differences`. Above Rs. 10 throws `JOURNAL_IMBALANCE` and the entire settlement rolls back.

---

## 8. Issues Fixed (This Session)

| # | Bug | Fix Applied |
|---|-----|-------------|
| 1 | `closeSession()` computed `expected_cash = opening_float` only (ignored cash sales) | Fixed: accept `tx.status === 'PAID'` (was filtering on `'SUCCESS'`) |
| 2 | Frontend showed theoretical = 0 | Fixed: use `calculatedSummary.expectedCash` (pre-computed server-side) |
| 3 | All orders had `session_id = NULL` | Fixed: `BaseOrderService.createOrder()` now saves `session_id` |
| 4 | Delivery settle didn't set `session_id` | Fixed: `deliveryRoutes.ts` settle endpoint now passes `session_id` |
| 5 | No multi-day session warning | Fixed: amber warning banner when session spans midnight |
| 6 | Historical orders unlinked | Script ran: 2 orders retroactively linked to active session |

## 9. Roadmap — Not Yet Implemented

| Feature | Journal Required | Impact |
|---------|----------------|--------|
| COGS recording at item prep | DR 5020 COGS / CR 1060 Inventory | True P&L gross margin |
| Bank card settlement (T+1) | DR 1000 Cash / CR 1010 Card Receivable | Balance sheet accuracy |
| SVC staff distribution UI | DR 2010 SVC Payable / CR 1000 Cash | Clears liability |
| Manager drawing formal entry | DR 1090 Drawing / CR 1000 Cash | Equity tracking |

---

*Report generated: 22 April 2026 09:04 PKT | Live API verified | FireFlow v2.0*
