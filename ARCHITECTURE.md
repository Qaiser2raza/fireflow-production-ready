# Architecture

## Layers

```
+-------------------------------------------------------------+
|  Frontend Layer                                              |
|  +---------------------+------------------------------------+
|  | POS / Main App      | React + Vite -> src/client/       |
|  | HQ App              | React + Vite HQ mode -> src/hq/   |
|  | PWA                 | Menu browsing -> pwa/             |
|  | QR PWA              | Table ordering -> qr-pwa/         |
|  +---------------------+------------------------------------+
+-------------------------------------------------------------+
|  API Layer                                                   |
|  +---------------------+------------------------------------+
|  | Express HTTP API    | src/api/server.ts                 |
|  | Route Modules       | src/api/routes/                   |
|  | Socket.IO Realtime  | src/api/server.ts                 |
|  | Middleware           | src/api/middleware/               |
|  +---------------------+------------------------------------+
+-------------------------------------------------------------+
|  Service Layer                                               |
|  +---------------------+------------------------------------+
|  | Orders              | src/api/services/orders/          |
|  | Accounting          | src/api/services/                 |
|  | Finance             | src/api/services/finance/         |
|  | Logistics           | src/api/services/logistics/       |
|  | Reports             | src/api/services/reports/         |
|  | Pairing/Licensing   | src/api/services/                 |
|  | Printing            | src/api/services/                 |
|  | QR Order Bridge     | src/api/services/qr/              |
|  +---------------------+------------------------------------+
+-------------------------------------------------------------+
|  Data Layer                                                  |
|  +---------------------+------------------------------------+
|  | Prisma Client       | src/shared/lib/prisma.ts          |
|  | PostgreSQL (local)  | prisma/schema.prisma              |
|  | Supabase Cloud      | src/shared/lib/cloudClient.ts     |
|  +---------------------+------------------------------------+
+-------------------------------------------------------------+
|  Desktop Layer                                               |
|  +---------------------+------------------------------------+
|  | Electron Main       | electron-main.cjs                 |
|  | Electron Renderer   | electron/main.ts                  |
|  | Preload / IPC       | preload.cjs                       |
|  +---------------------+------------------------------------+
+-------------------------------------------------------------+
```

---

## Modules

### Orders

**Status**: VERIFIED

- Base `orders` model with `order_number`, `status`, `payment_status`, `type`, `total`, `breakdown`
- Type extensions: `dine_in_orders`, `takeaway_orders`, `delivery_orders`, `reservation_orders`
- Items: `order_items` with `item_status`, `station_id`, `fire_batch_id`, `variant_id`
- Intelligence: `order_intelligence` table exists but is UNUSED in current code
- Strategy pattern: `BaseOrderService` + `OrderServiceFactory` with DineIn/Takeaway/Delivery/Reservation services

### Kitchen Display (KDS)

**Status**: VERIFIED

- Item status lifecycle: `PENDING` -> `PREPARING` -> `DONE` -> `SERVED` / `SKIPPED`
- Fire batches: `fire_batches` with versioning and recall
- Stations: `stations` model with printer routing
- Realtime: Socket.IO events for status changes

### Accounting / Finance

**Status**: VERIFIED (with conflict)

- Chart of Accounts: `chart_of_accounts` with hierarchical parent/child
- Journal entries: `journal_entries` + `journal_entry_lines` (proper FK to COA)
- Ledger entries: `ledger_entries` (string `account_id`, NOT a FK to COA)
- Cashier sessions: `cashier_sessions` with opening float, expected/actual cash, GL-based expected cash calculation
- Cashier shift logs: `cashier_shift_logs`
- Rider shifts: `rider_shifts` with opening float, closing cash, cash difference
- Rider settlements: `rider_settlements`
- Expenses: `expenses`
- Transactions: `transactions` (payment records)

**ARCHITECTURE CONFLICT**: Two parallel ledger systems exist:
- `journal_entries`/`journal_entry_lines` — proper double-entry with COA FK
- `ledger_entries` — simpler single-sided entries with string `account_id`

These serve overlapping purposes with different data models. The intended architecture likely consolidates to one system, but both remain in production.

### Inventory

**Status**: PARTIAL

- `inventory_items` with stock, minimum stock, unit cost
- `purchase_orders` + `purchase_order_items`
- `recipe_items` linking menu items to inventory
- **Missing**: stock movement table, batch/expiry tracking, automatic deduction on order settlement

### Delivery / Logistics

**Status**: VERIFIED

- `delivery_orders` linked to `orders`
- `rider_shifts` with opening float, status tracking
- `rider_settlements` with amount collected/expected/handed over
- Rider location fields: `current_lat`, `current_lng`
- Delivery status: dispatched, delivered, failed

### SaaS / HQ

**Status**: PARTIAL

- License keys: `license_keys` with cloud + local tracking
- Subscription payments: `subscription_payments` in local DB, verified via Supabase
- Super Admin view for license management
- HQ app on Vercel with Supabase auth
- **ARCHITECTURE CONFLICT**: SaaS data is split between Supabase cloud tables and local Prisma tables. The boundary is not clean.

### Device Pairing

**Status**: VERIFIED

- `pairing_codes` with time-limited codes, hashed, rate-limited
- `registered_devices` with fingerprint, auth token hash, station binding
- Device management UI in settings

### Printing

**Status**: VERIFIED

- Unified print gateway: `POST /api/print`
- Thermal and A4 printing via Electron IPC
- Network printer support with `printers` table
- Printer-station routing

### AI

**Status**: PARTIAL

- **Frontend**: `AURAAssistant.tsx` calls Google Gemini (`gemini-3-flash-preview`) directly from browser
- **Backend**: NO AI service, NO AI routes, NO AI abstraction layer
- **Database**: `order_intelligence` table exists but is not populated or queried by any service
- **Documentation**: Extensive intelligence architecture docs describe ML, prediction, self-healing — none implemented

**ARCHITECTURE CONFLICT**: Documentation describes AI as an "intelligence core" with predictive ML, anomaly detection, and self-healing. Actual implementation is a thin frontend chatbot with no backend intelligence layer.

---

## Database Boundary

- **Local PostgreSQL**: All operational data (orders, menu, inventory, accounting, staff, customers)
- **Supabase Cloud**: SaaS metadata (license keys, subscription payments, restaurant features)
- **Boundary rule**: Operational data never leaves local DB. SaaS data lives in cloud.

**ARCHITECTURE CONFLICT**: Some cloud operations write back to local DB (e.g., subscription verification updates local `restaurants`). The boundary is leaky.

---

## API Boundary

- **Internal API**: Express on port 3001, protected by `authMiddleware` (inconsistently)
- **Public API**: QR menu/order endpoints intentionally unauthenticated
- **SaaS API**: Supabase client for cloud operations
- **Realtime**: Socket.IO namespaced by restaurant room

**ARCHITECTURE CONFLICT**: Many inline routes in `server.ts` lack auth. Generic table API (`/api/:table`) accepts arbitrary filters. Public QR endpoints are not fully scoped.

---

## Tenant Boundary

- **Model**: `restaurants` is the tenant root
- **Enforcement**: `authMiddleware` attaches `req.restaurantId` from JWT
- **Data model**: Most tables have `restaurant_id` with tenant-scoped unique constraints
- **Gap**: Some routes accept `restaurant_id` from query/body instead of deriving from auth

---

## Frontend Architecture

- **Shell**: `App.tsx` provides context, routing, socket sync, and data orchestration
- **Views**: Functional components under `src/operations/` and `src/features/`
- **State**: React context + useState in `App.tsx`; no Redux or external state manager
- **Routing**: HashRouter in main app; BrowserRouter in HQ/PWA
- **Real-time**: Socket.IO client in `src/shared/lib/socketClient.ts`
- **API**: `fetchWithAuth` interceptor in `src/shared/lib/authInterceptor.ts`

**ARCHITECTURE CONFLICT**: `App.tsx` is 1,175 lines and mixes app shell, data orchestration, auth, socket, and UI state. This is a known technical debt item.

---

## Control Plane

FireFlow is evolving from a local-first POS to a managed SaaS platform. The target control-plane architecture is documented in `docs/MANAGED_SAAS_OPERATING_MODEL.md`.

Current reality: the HQ app (`src/hq/`) provides a separate Vercel-deployed control plane with Supabase auth. It manages licenses, subscriptions, and restaurant overview. It is NOT yet a unified support/operations platform.

## Integrations

| Integration | Status | Evidence |
|---|---|---|
| **Supabase** | PARTIAL | Used for SaaS licensing, payments, HQ auth |
| **Socket.IO** | VERIFIED | Realtime orders, tables, menu, staff updates |
| **Electron** | VERIFIED | Desktop wrapper, secure store, printer IPC |
| **Google Gemini** | PARTIAL | Direct frontend call in `AURAAssistant.tsx` |
| **FBR** | PARTIAL | Invoice fields, sync logs, but no full fiscal submission |
| **Sentry** | PARTIAL | Initialized, not fully instrumented |

