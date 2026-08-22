# FireFlow — Project Handout

## What is FireFlow

FireFlow is an **AI-native Business Operating System** for restaurants. It combines deterministic restaurant operations (POS, kitchen, inventory, accounting, delivery) with an AI assistance layer that recommends, summarizes, and assists — but never makes business-critical decisions.

**Core promise:** A restaurant can operate fully without AI. AI is additive, not required.

**Target market:** Pakistani restaurants (dine-in, takeaway, delivery, reservations). Default currency PKR, timezone Asia/Karachi.

**Deployment:** Electron desktop app + local PostgreSQL for operational data. Supabase cloud for SaaS licensing, subscriptions, and HQ. Web POS and PWA variants exist for mobile/tablet.

**Expansion path:** Modular architecture enabling future verticals (RetailFlow) and marketplace integrations (Cravex).

---

## What We Have Achieved So Far

### Completed missions

| Mission | Name | Status |
|---|---|---|
| **Mission 008A-RV** | Runtime verification foundation | 18/18 tests passed |
| **Mission 009** | Transaction boundary + outbox | 15/15 tests passed |
| **Mission 010** | Integration framework foundation | 24/24 tests passed |
| **Mission 011** | Payment lifecycle | 24/24 tests passed |
| **Mission 012** | Generic fiscal document boundary | 27/27 tests passed |
| **Mission 013** | First regional fiscal connector (FBR PK) | 14/14 tests passed |

### Verified infrastructure

| Layer | Component | Status |
|---|---|---|
| **Database** | PostgreSQL via Prisma Client 6, 47 models, 11 enums | Production-ready schema |
| **Backend** | Express 4 + Socket.IO 4, 87 route definitions | Functional |
| **Frontend** | React 19 + Vite 6 + Tailwind CSS 4 | Functional |
| **Desktop** | Electron 39 wrapper with IPC printing | Functional |
| **Cloud** | Supabase for SaaS licensing, payments, HQ | Functional |
| **Auth** | JWT + refresh tokens + role-based access | Partial |
| **Realtime** | Socket.IO with tenant-scoped rooms | Functional |
| **Outbox** | Durable event outbox with lease-based claiming | Functional |
| **Integrations** | Connector registry + dispatcher + delivery tracking | Functional |
| **Payments** | Split payments, attempts, idempotency, UNKNOWN reconciliation | Functional |
| **Fiscal** | Provider-neutral fiscal documents + attempts + outbox | Functional |
| **Accounting** | Double-entry journal, ledger entries, session closing | Functional |
| **Kitchen** | Fire batches, item status state machine, KDS | Functional |
| **Delivery** | Rider shifts, settlements, customer address book | Functional |
| **Menu** | Categories, items, variants, availability | Functional |
| **Customers** | CRUD, addresses, credit ledgers | Functional |
| **Floor** | Table management, sections, seating | Functional |
| **Reporting** | Financial, operational, loss prevention | Functional |
| **Device pairing** | Bcrypt-hashed codes, fingerprint binding, rate limiting | Functional |
| **Licensing** | Offline-capable license activation | Functional |

### Verified test coverage

```text
Mission 008A-RV:  18/18 passed
Mission 009:      15/15 passed
Mission 010:      24/24 passed
Mission 011:      24/24 passed
Mission 012:      27/27 passed
Mission 013:      14/14 passed
```

### Architectural guarantees delivered

- **Tenant isolation** enforced at every database boundary via `restaurant_id`
- **Financial authority** resides in backend; frontend previews never override
- **Atomic transactions** for order creation, settlement, fiscal document issuance
- **Idempotency** at document, request, and provider levels
- **Audit logging** for financial and security-sensitive actions
- **Provider-neutral design** — fiscal, payment, and integration layers are abstracted
- **No shared database** between FireFlow core and regional connectors
- **FBR isolation** — legacy FBR code untouched; new fiscal boundary is generic

---

## What Still Needs to Be Done

### Immediate priority: POS security hotfix (Mission 014A)

The POS boundary inspection revealed **6 critical security gaps** that block production readiness:

| # | Gap | Severity |
|---|---|---|
| 1 | `GET /api/orders/:id` missing `restaurant_id` — cross-tenant data leak | CRITICAL |
| 2 | `PATCH /api/orders/:id` allows void/cancel without server-side role check | CRITICAL |
| 3 | Discount `max` not enforced server-side | HIGH |
| 4 | No refund endpoint / silent refund metadata | HIGH |
| 5 | Plaintext staff PIN storage | HIGH |
| 6 | Printer CRUD unrestricted by role or restaurant scope | HIGH |

**Status:** Plan drafted at `.kilo/plans/mission-014A-pos-security-and-operational-safety.md`. Not yet implemented.

### POS operational safety gaps

| Gap | Impact |
|---|---|
| Table transfer does not mark new table OCCUPIED | Ghost tables, double-booking |
| Table merge endpoint missing | Feature incomplete |
| Table split not implemented | Feature missing |
| `firingInProgress` lock lost on restart | Duplicate kitchen tickets |
| No row-level locking on tables | Race conditions during seating |
| No refund endpoint | Refund workflow broken |
| Split payments bypass new payment aggregates | Payment tracking gap |
| No granular permission matrix | Overprivileged staff |
| No print audit logging | Unaudited operations |
| Terminal binding advisory only | Cross-terminal fraud risk |

### Inventory and stock management

| Gap | Impact |
|---|---|
| No stock movement tracking | Inventory accuracy |
| No batch management | Perishable goods |
| No auto-deduction on order items | Stock accuracy |
| No supplier ledger automation | Manual reconciliation |

### Cravex marketplace integration (postponed)

| Capability | Status |
|---|---|
| Inbound order injection | Not started |
| Outbound catalog sync | Not started |
| Order status sync | Not started |
| Cancellation/refund authority | Not started |
| Customer identity mapping | Not started |
| Delivery responsibility | Not started |
| Commission/settlement | Not started |
| Webhook inbound | Not started |

**Blocker:** Cravex API specification and ownership model not yet documented.

### AI backend layer

| Gap | Impact |
|---|---|
| Frontend-only chatbot | No backend intelligence |
| No agent orchestration | No tool use, memory, or guardrails |
| No tenant-scoped AI memory | Context leakage risk |
| No agent audit logging | Compliance gap |

### Testing and quality

| Gap | Impact |
|---|---|
| No dedicated POS/cashier/kitchen tests | Release risk |
| No unit tests | Regression risk |
| No CI test execution | Quality gate missing |
| No coverage tooling | Unknown coverage |
| `taxes-sc-logic` test fails | Broken test |

### Data and compliance

| Gap | Impact |
|---|---|
| No data retention/purge policy | Compliance risk |
| Soft delete + 24h draft cleanup only | Incomplete |
| No backup/restore documentation | Disaster recovery |
| Supabase credentials in `.env.example` | Security concern |

---

## Recommended Priority Sequence

```text
1. POS security hotfix (Mission 014A)
   ↓
2. POS operational safety verification
   ↓
3. POS command and performance inventory
   ↓
4. POS speed/readiness improvements
   ↓
5. Inventory automation
   ↓
6. Cravex marketplace integration
   ↓
7. AI backend layer (Fable 5)
```

**Rationale:** AI and Cravex should not be built on a POS that can leak cross-tenant orders or authorize voids through client-only controls. Security and operational safety come first.

---

## Key Decisions Needed

1. **Product scope priority:** Is FireFlow a local POS, hybrid SaaS, multi-product ecosystem, or all three?
2. **AI strategy:** Backend AI service layer or remain frontend-only chatbot?
3. **Enum reconciliation:** Which status enums are canonical — `schema.prisma` or legacy docs?
4. **Supabase integration:** Production-ready or still in development?
5. **Branch model:** `main` or `develop` as primary working branch?
6. **Refund authority:** Who owns refunds — cashier, manager, or payment provider?
7. **Terminal identity:** MAC address, hardware ID, or user-assigned?
8. **Offline mode:** Full order creation or read-only?
9. **Retention policy:** Legal/compliance requirements for fiscal, audit, and session logs?
10. **Cravex API:** When will the specification be available?

---

## Contact

For questions about this handout, refer to:
- `PROJECT_CONSTITUTION.md` — product identity and principles
- `CURRENT_STATE.md` — verified repository reality
- `AGENTS.md` — agent context and source priority
- `.kilo/plans/` — mission plans and implementation status
