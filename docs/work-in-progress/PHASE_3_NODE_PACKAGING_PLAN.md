# Phase 3 — Node Packaging Plan

---
status: ACTIVE — first slice: headless service mode
owner: FireFlow team
builds-on: Phase 2 (wizard + PIN lifecycle)
last_reviewed: 2026-08-26
---

## Objective

Turn the per-restaurant FireFlow node from "laptop app" into a packaged
appliance: headless capable, one-command startup, reference Docker appliance,
kiosk-ready, documented auto-boot and recovery behavior.

## Current state

- `electron-main.cjs` + `scripts/launch-electron.js` — Electron shell exists,
  creates a visible BrowserWindow (1200×800), spawns the API server on :3001,
  loads Vite dev server in development or built files in production.
- `npm run electron:build` — bundles via electron-builder but produces a
  desktop-app artifact, not a headless service.
- No Dockerfile / docker-compose at the project root.
- No kiosk, auto-boot, or UPS/backup guidance.

## First slice: headless service mode (this session)

Add `HEADLESS=1` support:

- `electron-main.cjs`: when `HEADLESS=1`, skip `mainWindow.show()` and
  `openDevTools()`. Window still loads internally so the server lifecycle stays
  identical, but no display is required. Process stays alive because the
  BrowserWindow exists (even if hidden) and `window-all-closed` handler only
  kills the server on non-darwin platforms when a window actually closes.
- package.json: document `HEADLESS=1 npm run electron` in scripts help.

Verification: `HEADLESS=1 npm run electron` starts, server boots on :3001,
API responds to health check, no visible window.

## Planned follow-up slices (not started)

| Slice | Deliverable | Size |
|---|---|---|
| 3.1 | Reference Docker appliance (`Dockerfile` + `docker-compose.yml`) | medium |
| 3.2 | One-command installer script (Windows .ps1 + shell script) | medium |
| 3.3 | Kiosk-mode + auto-boot guidance (systemd / Windows Task Scheduler) | small |
| 3.4 | UPS/backup guidance doc | small |

## Sequencing

Headless mode first because it unblocks the Docker slice (no display server
dependency). Docker second because it gives the founder a reproducible
reference appliance for the onboarding node. Installer and boot guidance come
last because they depend on a stable packaged artifact.

## Out of scope for Phase 3

- Managed Postgres vendor decision (Phase 6)
- Cloud bridge / sync (Phase 6)
- Public surfaces (Phase 7)
- Channel adapters (Phase 8)
