---
status: CANONICAL
audience:
  - engineering
  - Kilo Code
owner: FireFlow team
last_reviewed: 2026-08-23
source: CTO directive 2026-08-23 (combined project instruction)
sensitivity: internal
---

# FireFlow Engineering Instructions

## Read before every task

1. Read root `AGENTS.md` completely.
2. Read `docs/AI/README.md`.
3. Read the active mission or phase document.
4. Read relevant canonical architecture and security documents.
5. Read `docs/technical-debt/REGISTER.md`, if present.
6. Check recent commits and the working-tree status.
7. Treat archived, superseded, and draft documents as non-authoritative unless explicitly instructed otherwise.

If any required file is missing, unclear, or contradictory, stop and report that before changing code.

## Product boundary

FireFlow is a restaurant-native operating system. It owns restaurant operations, orders, POS, kitchen workflows, accounting, inventory, cashier sessions, payment lifecycle, fiscal-document abstraction, reconciliation, tenant security, and business rules.

Cravex is a separate commerce system. It must integrate through authenticated contracts and must never bypass FireFlow validation, accounting, inventory, payment, tenant, or compliance controls.

Regional compliance providers such as FBR, ZATCA, and ETA enter through generic FireFlow fiscal contracts. Provider-specific payloads and behavior belong in connectors.

AI is accessed only through a FireFlow-owned gateway. AI has no raw database access, cannot cross tenants, cannot access secrets, and cannot directly approve or perform accounting, payment, refund, or void actions.

Do not make Cravex, FBR, AI, DSH, DeepSeek, Qwen, Google, or another provider a FireFlow core dependency.

## Non-negotiable invariants

- No request, event, worker, adapter, socket, or AI tool may cross tenant boundaries.
- Tenant context must come from trusted authentication or server-side state, never from an untrusted client hint.
- Every tenant-sensitive transport must enforce scope:
  - HTTP: JWT and service scope
  - Socket.IO: authenticated room and emission scope
  - jobs/outbox: trusted tenant context
  - database: tenant-scoped queries
- Business services remain the authority for authorization and business rules.
- Posted accounting records are immutable.
- External timeouts are not proof of failure; unknown outcomes must remain reconcilable.
- Events represent business facts, not provider commands.
- Secrets, private keys, plaintext PINs, tokens, and production personal data must not enter logs, events, training data, or documentation.
- AI may read approved information or propose actions, but FireFlow services decide whether actions are valid and authorized.

## Mission and scope discipline

Before editing:

1. Inspect the repository and current implementation.
2. Identify the relevant transaction boundary and invariant.
3. State the smallest safe change.
4. Confirm the change is inside the active mission.
5. Check for security, tenant, migration, and compatibility effects.

During editing:

- Make the smallest scoped change.
- Do not perform broad refactors.
- Do not redesign unrelated domains.
- Do not begin deferred work merely because it is nearby.
- Preserve historical commits and mission records.
- Leave unrelated scratch changes untouched.
- If an issue is outside scope, document and classify it instead of fixing it automatically.

Use this workflow:

```text
Inspect → Understand → Identify invariant → Make smallest change → Test → Review → Commit
```

## Documentation during development

Documentation must be created and updated as the system is built, but final polishing happens after the related build area is complete and verified.

During implementation:

- Record discoveries in `docs/work-in-progress/`.
- Record proposed lasting decisions in `docs/architecture/proposals/`.
- Record unresolved problems in `docs/technical-debt/REGISTER.md`.
- Create draft workflow, role, MCP, and engineering documents when behavior becomes sufficiently clear.
- Mark unfinished material as `DRAFT`.
- Do not rewrite historical mission reports.
- Do not create duplicate documents when an existing canonical document can be updated.
- Do not make generated notes or Kilo-created notes authoritative automatically.

After implementation and verification:

1. Review drafts.
2. Remove contradictions and duplication.
3. Convert approved material into canonical documentation.
4. Create role-specific guides, training data, MCP references, and in-product help as appropriate.
5. Link replaced documents to their successors.
6. Record the verification evidence and document owner.

Only approved `CANONICAL` documents define current behavior.

Document statuses: `DRAFT`, `REVIEW`, `CANONICAL`, `SUPERSEDED`, `ARCHIVED`.

Document metadata convention:

```yaml
---
status: DRAFT
audience:
  - engineering
owner: FireFlow team
last_reviewed: 2026-08-23
source: Mission or phase identifier
sensitivity: internal
---
```

## Documentation audiences

Keep these separate: restaurant owner; manager; cashier; chef/kitchen staff; waiter; rider; SaaS owner/platform administrator; support operator; engineer; MCP/tool consumer; Kilo Code.

Do not expose internal architecture, secrets, provider credentials, database details, or security weaknesses in ordinary restaurant user guides.

Training data must use approved documentation and synthetic data. It must not contain secrets, private keys, real customer data, payment credentials, raw production logs, tokens, or unredacted security findings.

Kilo-specific instructions may summarize canonical documents, but canonical architecture and security documents remain the source of truth.

## Kilo documentation process

Before code changes, read: `docs/AI/README.md`; the active mission; relevant architecture decisions; security invariants; technical-debt register.

During code changes, create or update only the documents needed for design decisions, behavior and workflow, verification evidence, unresolved technical debt, MCP/tool contracts, and Kilo task context.

At the end of a mission, report: documentation created; documentation updated; drafts still requiring review; technical debt added or changed; verification performed; deferred work preserved.

Do not refine every document continuously. Capture accurate working notes during construction, then consolidate and polish after the build is complete and verified.

## Phase 1 current state (verified 2026-08-23)

Phase 1 design approved with conditions (all seven incorporated). Verified actual state at last checkpoint:

- **Slice A COMPLETE** — design rev. 2; `20260823_phase1_owner_invites` migration (+ repaired drifted `20260821_add_refresh_token_rotation` bookkeeping); CSPRNG PIN; hash-only persistence; `must_change_pin`; seven-day expiry; identifier-only outbox payloads; secret-free audits; SUPER_ADMIN provisioning route; one-time PIN handover; dual-mode tenant-safe licensing status/sync; orphaned registration view removed; 22/22 provisioning suite.
- **Slice B COMPLETE** — `SupabaseAdminService` outcome-classified port; `OwnerInviteDispatcher` (idempotency by `invite_id`/`restaurant_id`, retry/backoff, UNKNOWN reconciliation, duplicate→MANUAL); manual-retry + list routes (SUPER_ADMIN); `20260823_phase1_cloud_sync_flag` migration; test-mode dispatcher disabled; 25/25 dispatcher suite.
- **Verification:** release gate **10/10 PASS** (both new suites registered). Slice A/B changes were uncommitted at this checkpoint — always inspect actual repository state rather than relying on this summary.
- **Claim-model note (CTO-reported):** outbox rows remain the durable intent record; the dispatcher claims work from invite/mirror STATE because the generic `OutboxReader` already consumes all outbox rows. All contract properties (idempotency key, known-result transitions, reconcilable UNKNOWN) hold.

## Phase 1 next scope

Slice C remains pending:

- Vault provisioning modal;
- invitation/status badges;
- printable handover sheet.

Slice C requirements: show the one-time PIN only in the handover flow; warn it cannot be retrieved later; never log/persist the plaintext PIN; distinguish pending/sent/retrying/unknown/manual-action states; restrict access to authorized platform users; prevent cross-tenant exposure; never present an invitation as successful before the provider result is known.

## Verification requirements

Before declaring a task complete:

- run the relevant focused tests;
- run TypeScript checking;
- run the production build when applicable;
- run the release gate when required;
- verify tenant isolation;
- verify failure, retry, timeout, and duplicate behavior;
- inspect logs and event payloads for secret leakage;
- verify database transaction and rollback behavior;
- confirm test processes terminate cleanly (on Windows, kill the full process tree — an orphaned node child holding :3001 has twice caused false failures);
- report environmental failures separately from product failures.

Never claim browser verification without an actual browser or equivalent browser-capable runner.

If a database-bound suite depends on a server port: ensure no stale server occupies the port; use the required test environment; run suites sequentially when shared fixtures require it; record environmental interference accurately; do not treat a stale-process false-negative as an application regression.

## Release and commit discipline

Before commit: `git status --short`; `git diff --check`; `git diff`.

Confirm: only in-scope files staged; unrelated scratch work untouched; generated diagnostics excluded; no secrets or private keys tracked; required release gate passed.

Do not push unless explicitly authorized.

Do not label work production-ready when browser verification, CI checks, security remediation, onboarding, or other release conditions remain incomplete.

## Deferred work

Outside current Phase 1 Slice A/B scope unless explicitly authorized: SaaS onboarding beyond the approved provisioning slice; invitations frontend work (until Slice C); MFA; licensing-model redesign; Cravex; FBR/regional connectors; AI or DSH; outbox redesign; payment lifecycle redesign; inventory; unrelated refactoring.

Known technical debt must be recorded in `docs/technical-debt/REGISTER.md`, never silently forgotten.
