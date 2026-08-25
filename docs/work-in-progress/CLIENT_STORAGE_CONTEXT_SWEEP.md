---
status: DRAFT
audience:
  - engineering
owner: FireFlow team
last_reviewed: 2026-08-25
source: F-V15 remediation (storage/context sweep mandate)
sensitivity: internal
---

# Client Storage × Context Sweep (DRAFT)

Mandate: every localStorage key with a consuming context must have a write
path that updates that context from server truth — or be explicitly exempt.
Swept 2026-08-25 against `src/client`, `src/auth`, `src/shared`.

| Key | Writers | Readers | Consuming context/state | Verdict |
|---|---|---|---|---|
| `currentRestaurant` | `App.login()` (response payload) · RestaurantContext save-effect (mirror) · mount-load · expiry update | RestaurantContext mount hydration · SubscriptionGuard | `RestaurantContext.currentRestaurant` — render-time tenant truth | **OK** (post F-V15 fix): every lifecycle event writes context from server response; storage is mirror/cache |
| `restaurant_id` | `App.login()` · terminal provisioning (manual) | 60+ sites: request-parameter convenience (`orderService`, `tableService`, `cloudClient`, `logger`, `featureFlags`, socket rooms, types defaults) | Not React state — direct request scoping input | **ACCEPTED RISK (TD-13)**: pre-auth binding selects PIN space; overwritten from login response before shell renders; single-tenant terminals today. Phase 5-6 owns deliberate design |
| `accessToken` / `refreshToken` / `accessTokenExpiry` | `App.login()` (response) · `authInterceptor` refresh rotation | `jwtClient`, `authInterceptor`, `socketClient` | Transport credentials — auth state itself is in-memory `currentUser`; server enforces authority via 401→refresh→retry | **OK** — no render state depends on them; logout clears all three |
| `x-session-id` | `App` boot/session creation | `authInterceptor` header | Server cashier-session correlation | OK |
| `saved_pin` | *none* (writers removed; plaintext auto-login deleted for security) | none (only `removeItem` cleanup paths remain) | nothing | **DEAD KEY** — candidate for deletion sweep (G5 hygiene) |
| `user_preferences` | `PreferencesContext` (load-on-mount, save-on-change) | same | own context — self-consistent both directions | OK |
| `app_theme` | `ThemeContext` | same | own state | OK |
| `fireflow_ops_cfg` (+ per-tenant `fireflow_operations_config_<id>`) | `App.fetchInitialData` after server fetch | ops-config load fallback | `AppContext` ops config — hydrated from server response directly | OK — cache written only after server truth arrives |

## Conclusions

1. Post-F-V15, every auth-lifecycle event writes context from server truth.
   The one intentional exception is the device binding (`currentRestaurant` /
   `restaurant_id` surviving logout), which is TD-13 and never rendered pre-auth.
2. `restaurant_id`'s 60+ direct reads are the systemic weak point: request
   scoping depends on a storage string rather than authenticated context.
   Server-side `req.restaurantId` remains the true boundary (invariant), so
   client reads are UX convenience only — but they should migrate to
   context-derived values when the Phase 5-6 decision lands.
3. Dead keys found: `saved_pin`. Add to G5 hygiene sweep.
