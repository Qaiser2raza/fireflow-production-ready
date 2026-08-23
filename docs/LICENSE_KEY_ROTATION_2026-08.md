# License Signing Key Rotation — 2026-08-22/23

## Event

During Mission-016 secret review, `saas_private.pem` was confirmed exposed via commit
history (`05b9b1d`, present on `origin/main`). Rotation was mandated and performed.

## What happened (audit trail)

1. **Initial rotation (commit `103ad3d` era):** keypair regenerated as RSA-2048 and PEMs
   untracked/gitignored. Subsequent release-control review discovered this pairing was
   **incorrect**: `LicenseService` verifies licenses against a **hardcoded ECDSA P-256**
   public anchor, and the original exposed key was the matching ECDSA private key.
   The RSA swap broke signer↔verifier pairing — newly signed licenses would verify as
   `tampered`.
2. **Corrected rotation (this change set):** a fresh **ECDSA P-256** pair (PKCS#8/SPKI)
   replaced the RSA material; `LicenseService.SAAS_PUBLIC_KEY_PEM` was re-anchored to the
   new public key; `license.lic` was reissued for tenant `b1972d7d…` (Fireflow Restaurant,
   PREMIUM) bound to the live hardware fingerprint and the originally authorized expiry.

## Consequence handling

- All previously issued hardware-fingerprint licenses are cryptographically dead
  (old private key retired). Affected tenants require **license reissuance** through the
  platform licensing flow — recorded as an operational migration consequence per CTO
  direction.
- The dev/demo tenant license was reissued locally as the exercised proof of the
  reissuance procedure.

## Verification evidence (`scratch/verify-license-matrix.cjs`, 9/9)

| Case | Expected | Result |
|---|---|---|
| new signature + new public anchor + live fingerprint | active | PASS |
| valid signature + wrong fingerprint | tampered | PASS |
| legacy/foreign signature + new public anchor | tampered | PASS |
| expired beyond grace (7 days) | expired | PASS |
| withdrawn license file | unlicensed | PASS |
| soft-UUID fallback contract (isolated simulation) | active | PASS |
| entitlement tenant / plan / expiry preserved | b1972d7d… / PREMIUM / 2027-05-20 | PASS ×3 |

Live fingerprint source at issuance: hardware path, matching the fingerprint embedded in
the pre-rotation license (`a069c92a…`) — confirming host continuity.

## Operational procedure going forward

1. Provision `saas_private.pem` / `saas_public.pem` out-of-band per deployment
   (**never** committed; `*.pem` gitignored).
2. To issue/reissue: sign the standard payload (restaurant_id, restaurant_name, plan,
   subscription_expires_at, grace_period_days, hardware_fingerprint, issued_at) with the
   deployment private key using ES256-style compact serialization; deliver as
   `license.lic` to the restaurant host.
3. On any future compromise: repeat this procedure — new ECDSA P-256 pair, re-anchor
   `SAAS_PUBLIC_KEY_PEM`, reissue all tenant licenses, purge old material from history.

No private keys, license tokens, or full fingerprints are recorded in this document.
