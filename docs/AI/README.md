---
status: CANONICAL
audience:
  - Kilo Code
  - engineering
owner: FireFlow team
last_reviewed: 2026-08-23
source: CTO directive 2026-08-23
sensitivity: internal
---

# FireFlow AI/Kilo Documentation Index

## Read first

1. Root `AGENTS.md` (primary instruction file).
2. The active mission or phase document.
3. `docs/canonical/` documents relevant to the task.
4. `docs/technical-debt/REGISTER.md`.
5. Recent mission and release records relevant to the task.

Detailed engineering instructions: `docs/AI/ENGINEERING_INSTRUCTIONS.md`.

## Authority order

```text
Approved canonical documents
        ↓
Active mission instructions
        ↓
Approved architecture decisions
        ↓
Current implementation and tests
        ↓
Draft working notes
        ↓
Historical and archived documents
```

When sources conflict, stop and report the conflict. Do not silently choose one.

## Documentation during building

- Capture discoveries while implementing.
- Use `DRAFT` for unfinished documentation.
- Record unresolved issues in the technical-debt register.
- Do not rewrite historical mission records.
- Do not treat generated or temporary notes as authoritative.
- Refine and consolidate documents after the relevant implementation is complete and verified.

## Required completion report

Every task report should state:

- files changed;
- code behavior changed;
- tests run and exact results;
- release-gate result where applicable;
- documentation created or updated;
- technical debt discovered;
- deferred work left untouched;
- remaining risks or review decisions needed.
