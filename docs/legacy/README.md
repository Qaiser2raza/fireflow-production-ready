# Legacy Documentation

This directory contains documents that are no longer considered current FireFlow truth.
They are preserved for historical reference only.

**Do not make implementation decisions based on these documents.**
Refer to `AGENTS.md` for the current documentation hierarchy.

---

## Legacy Documents

The following documents have been classified as LEGACY, STALE, CONTRADICTED, or SUPERSEDED during Mission 002 truth reconciliation:

| Document | Classification | Reason |
|---|---|---|
| `docs/ORDER_BOOKING_WORK_PROCESS.md` | CONTRADICTED | Status enums differ from actual schema. Claims `ItemStatus` includes `DRAFT`; schema does not. Claims `OrderStatus` has 5 values; schema has 9. |
| `docs/MASTER_BLUEPRINT_V3.md` | CONTRADICTED | Documents `order_intelligence` fields that do not exist in schema (`predicted_duration_mins`, `actual_complete_time`, `prediction_accuracy`). |
| `docs/INTELLIGENT_SYSTEM_ARCHITECTURE.md` | CONTRADICTED | Describes ML, self-healing, anomaly detection — none implemented. |
| `docs/AI_ASSISTANT_README.md` | STALE | Claims `ORDER_BOOKING_WORK_PROCESS.md` is "single source of truth"; that document is now contradicted. |
| `docs/PHASE_*_*.md` (multiple) | HISTORICAL | Phase completion docs from earlier development stages. |
| `docs/SEEDING_*.md` (multiple) | HISTORICAL | Seeding implementation docs from January 2026. |
| `docs/DEVICE_PAIRING_*.md` (multiple) | HISTORICAL | Device pairing implementation docs; code has evolved. |
| `docs/MOBILE_*.md` (multiple) | HISTORICAL | Mobile enhancement docs from earlier phases. |
| `docs/DELIVERY_*.md` (multiple) | HISTORICAL | Delivery module docs; some content may be stale. |
| `PILOT_READY.md` | HISTORICAL | Pilot deployment checklist from earlier phase. |
| `README.md` | STALE | Claims `develop` branch is primary; actual working branch is `main`. |
| `openapi.json` | CONTRADICTED | Describes Supabase/PostgREST schema, not current Express API. |

---

## Migration Path

These documents should eventually be:
- Moved to this `docs/legacy/` directory
- Updated with a header note: `LEGACY — NOT CURRENT FIREFLOW TRUTH`
- Or deleted if they have no historical value

**Do not move or delete them until explicitly instructed.**
