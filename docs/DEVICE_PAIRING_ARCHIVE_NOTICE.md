# ARCHIVED — do not follow these documents

The `docs/DEVICE_PAIRING_*.md` files are **historical and partly wrong** (CTO decision, 2026-10-02).
They are kept only for reference; they must not be used as a specification.

They were written before the code settled and disagree with the verified implementation in 12 places.
The verified state, with file:line evidence, is **`docs/AUDIT_DEVICES.md`** (Task 07a audit, approved).

Known wrong claims in the archived set (details and references in `docs/AUDIT_DEVICES.md` §7):
- "no plaintext codes in DB" — the code is stored in plaintext next to its bcrypt hash
  (`src/api/services/pairing/PairingService.ts:70`).
- Device token kept in keytar / an httpOnly cookie, "not localStorage" — it is plaintext
  `localStorage['deviceAuthToken']` (`src/auth/views/DevicePairingVerificationView.tsx:80`), and the
  Electron store uses a hardcoded key (`electron-main.cjs:11`).
- Pairing fingerprint is SHA-256 of UA+screen+timezone — the pairing flow uses a weak 32-bit DJB2 hash
  (`src/shared/lib/deviceFingerprint.ts:4-10`); only the M035 PIN-trust fingerprint is SHA-256
  (`src/shared/lib/deviceFingerprint.ts:13-23`).
- `/api/devices/validate-token` exists — it does not, which is why `registered_devices.auth_token_hash`
  is written but never validated.
- The device management UI (`/api/devices`) exists — those routes do not exist; the view is mounted and
  broken (`src/features/settings/DeviceManagementView.tsx:26,42`).
- The pairing verification screen is reachable — `setShowDevicePairing` is only ever set to `false`
  (`src/client/App.tsx:995,1041,1045`).

Files in this archive set: `DEVICE_PAIRING_SECURITY.md`, `DEVICE_PAIRING_QUICK_REF.md`,
`DEVICE_PAIRING_QUICK_START.md`, `DEVICE_PAIRING_IMPLEMENTATION.md`,
`DEVICE_PAIRING_PHASE_2A2_COMPLETE.md`, `DEVICE_PAIRING_RALF_NOTES.md`, `DEVICE_PAIRING_RALF_NOTES.md`.

They were not physically moved because `AGENTS.md` forbids moving legacy documents (add classification
notes instead). This file is that classification note.
