LEGACY � NOT CURRENT FIREFLOW TRUTH

This document is classified as STALE.
It claims develop is the working branch; the actual working branch is main.
It also references outdated phase status and branch protection.
For current truth, see AGENTS.md -> CURRENT_STATE.md.
# Fireflow – Restaurant Management System

Cross-platform desktop POS for Pakistani restaurants  
(Dine-in, Takeaway, Delivery, Reservations)

## Current Status
Phase 2 complete – security hardened & pilot-ready (January 2026)

- Encrypted tokens (electron-store)
- JWT + refresh + revocation
- Zod validation on critical endpoints
- Atomic transactions (orders + table sync)
- Device pairing (QR + fingerprint)
- Real-time Socket.IO

## Quick Start (Development)
```bash
npm install
npm run dev          # frontend + backend proxy
```

## Important
- Private repo – contains sensitive business logic
- Never commit `.env`, database dumps, or real restaurant data
- See PILOT_READY.md for deployment checklist
- Work on `develop` branch – main is protected

