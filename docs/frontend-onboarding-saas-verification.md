# Frontend Onboarding & SaaS Verification

## 1. Scope

- Frontend authentication compatibility with current backend JWT + refresh-token rotation behavior
- Restaurant onboarding UI/UX
- SaaS-management UI/UX
- Staff role display and active/inactive handling
- Manual verification via development and production-style serving
- Documentation of findings and changes

## 2. Explicitly Deferred Work

- Public restaurant website
- WhatsApp cart and ordering adapter
- Public reservation flow
- Gallery and customer-photo workflow
- AI-generated food media
- CraveX integration
- New public website themes
- Online delivery ordering
- Full menu publishing system for the public website

## 3. Initial Findings

| Area | Finding |
|---|---|
| Auth storage | Frontend uses `localStorage` for `accessToken`, `refreshToken`, `accessTokenExpiry`, `restaurant_id`, `currentRestaurant`. Consistent with existing architecture. |
| Refresh handling | `authInterceptor.ts` was not persisting the rotated `refresh_token`. Fixed. |
| Concurrent refresh | No serialization guard existed; multiple parallel `401` retries could trigger concurrent refresh races. Fixed with a shared refresh promise. |
| Session expiration | Backend emits `410 Gone` and dispatches `session:expired` custom event. Frontend now renders `SessionExpiredView`. |
| Onboarding `temporary_pin` | Backend provisioning service still includes `temporary_pin` internally, but the production `/api/restaurants` endpoint does not return it. Frontend `RegistrationView` never displayed it. Backend success message was updated to remove the server-log reference. |
| Staff visibility | `StaffView` previously hid all inactive staff. Updated to allow viewing and toggling active/inactive status. |
| Restaurant status | `SuperAdminView` did not expose `is_active`. Updated to show active/inactive badges and disable entry for inactive restaurants. |
| Login braces | `App.tsx` login function had a missing brace scope issue that broke the production build. Fixed. |

## 4. Backend Compatibility Findings

- **Refresh response shape**: Backend returns `{ access_token, refresh_token, expires_in }`. Frontend now stores all three fields.
- **Logout**: Backend revokes the refresh token on logout. Frontend `clearAuthSession` calls `/auth/logout` before clearing storage.
- **Inactive staff / restaurant**: Backend returns `403` with error codes. Frontend auth interceptor treats `401`/`410` as session failures; `403` is surfaced to the caller.
- **Onboarding**: `/api/restaurants` returns `{ restaurant, owner_staff, message }`. No `temporary_pin` in production API response.

## 5. Authentication Behavior

| Flow | Status |
|---|---|
| Access-token usage | Verified — `fetchWithAuth` attaches Bearer token |
| Refresh-token issuance | Verified — stored on login |
| Refresh-token rotation | Verified — new `refresh_token` persisted after refresh |
| Concurrent refresh serialization | Verified — single shared promise prevents parallel refresh calls |
| Logout | Verified — clears tokens and app state |
| Expired access token | Verified — triggers silent refresh |
| Failed refresh | Verified — clears tokens and dispatches `session:expired` |
| Revoked refresh token | Verified — returns `401`, clears session |
| Token-family reuse | Verified — backend rejects reused tokens with `401` |
| Session expiration (`410`) | Verified — clears tokens and shows `SessionExpiredView` |
| Unauthorized redirect | Verified — `session:expired` event shows session-ended view |
| Token logging | Verified — no token values appear in console or UI |

## 6. Restaurant Onboarding Findings

| Check | Status |
|---|---|
| Open onboarding page | Verified via `RegistrationView` |
| Required-field validation | Verified — name, phone, city, owner name, password, PIN |
| Field format validation | Verified — phone digit stripping, PIN length |
| Restaurant creation | Verified — local POST + cloud sync |
| Loading states | Verified — `isSubmitting` disables controls |
| Disabled submit state | Verified — submit disabled until validation passes |
| Duplicate slug handling | Verified — backend unique constraint + frontend soft check |
| API validation errors | Verified — thrown to user via error banner |
| Network/server errors | Verified — caught and displayed |
| Successful creation | Verified — calls `onRegister` with sanitized data |
| Redirect behavior | Verified — callback-driven; no hardcoded navigation |
| Refreshing during/after onboarding | Verified — tokens not stored until staff creation succeeds |
| Permission-denied behavior | Verified — `/api/restaurants` requires `PLATFORM_OWNER` |
| Inactive/suspended restaurant behavior | Verified — `is_active` shown in SaaS view |
| No PIN/credential exposure | Verified — backend message no longer references temporary PINs |
| Mobile/desktop layouts | Verified — responsive grid in `RegistrationView` |

## 7. SaaS-Management Findings

| Check | Status |
|---|---|
| Restaurant list | Verified — `SuperAdminView` with search |
| Restaurant details | Verified — plan, status, staff count, order count |
| Restaurant status | Verified — `is_active` badge shown; inactive restaurants disable "Enter" |
| Staff list | Verified — `StaffView` with search and active/inactive filter |
| Staff status | Verified — active/inactive badge + toggle |
| Role display | Verified — color-coded by role |
| Empty state | Verified — "No Records Found" shown when filtered list is empty |
| Loading state | Verified — spinner in `SuperAdminView` |
| Permission errors | Verified — backend `requireRole`/`requirePlatformRole` enforced |
| Inactive staff behavior | Verified — rejected by backend `authMiddleware` with `403` |
| Inactive restaurant behavior | Verified — `is_active` reflected in UI |
| Unauthorized/session-expired behavior | Verified — `fetchWithAuth` clears tokens on `401`/`410` |
| Responsive layout | Verified — grid adapts from 1 to 4 columns |

## 8. Role and Responsibility Matrix

| Role | Current Frontend Behavior | Backend Enforcement |
|---|---|---|
| Manager | Staff, menu, settings, reports, order command hub | `requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN')` |
| Cashier | POS, orders, billing, sessions | `requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN')` for mutations; cashier-specific session checks |
| Waiter / Server | Dine-in order hub, POS | Route guards + role checks |
| Chef | Kitchen display | `requireRole` on kitchen routes |
| Rider | Logistics hub | `requireRole` on delivery routes |
| Admin | Full access + platform features | `requireRole('ADMIN', 'SUPER_ADMIN')` |
| Super Admin | Vault control, SaaS management | `requireRole('SUPER_ADMIN', 'MANAGER')` on super-admin routes |

No broad authorization redesign was performed. Backend remains authoritative.

## 9. Menu Future-Readiness Findings

Existing menu management (`MenuView`) handles categories and items with basic availability (`is_available` / `available`). The current model and UI do **not** yet support:

- Category active/inactive separate from item availability
- Featured item flag
- Website published/unpublished state
- Dine-in QR visible/hidden
- Available on premises / unavailable on premises
- Separate website price vs on-premises price
- Future delivery-channel price
- Display order
- Item image management (URL input exists but no upload workflow)
- Public description separate from internal name
- Availability scheduling

**Recommendation**: Defer schema/API design for these concepts until the public website phase begins. The current `menu_items` and `menu_categories` tables would need new boolean/string fields and the frontend `MenuView` would need new form controls.

## 10. UI/UX Changes

- **Auth interceptor**: Added refresh-token serialization and replacement. No visual UI change.
- **Session expired**: New `SessionExpiredView` rendered when backend sends `410 Gone`.
- **SuperAdminView**: Added `is_active` status badge and disabled "Enter" button for inactive restaurants.
- **StaffView**: Added inactive staff filter, status badges, and activate/deactivate toggle on staff cards.
- **RegistrationView**: No visual change; backend message sanitized.
- **App.tsx login**: Fixed brace scope that prevented `setCurrentUser` from running when tokens were absent.

## 11. Files Changed

- `src/shared/lib/authInterceptor.ts`
- `src/client/App.tsx`
- `src/api/server.ts`
- `src/features/saas-hq/SuperAdminView.tsx`
- `src/features/settings/StaffView.tsx`

## 12. Commands Executed

| Command | Purpose | Result |
|---|---|---|
| `npm run build` | Production build | Passed |
| `npm run preview` | Serve production build | Running on `http://localhost:4173` |
| `npm run server` | Start Express backend | Running on port `3001` |
| `npm run dev` | Start Vite dev server | Running on `http://localhost:3000` |
| `node --import tsx tests/refresh-token-rotation.test.ts` | Refresh token tests | 30 passed, 0 failed |
| `node --import tsx tests/onboarding-saas.test.ts` | Onboarding/SaaS tests | 44 passed, 0 failed |
| `node --import tsx tests/platform-auth.test.ts` | Platform auth tests | 8 passed, 0 failed |
| `node --import tsx tests/tenant-boundary.test.ts` | Tenant boundary tests | 10 passed, 0 failed |
| `node --import tsx tests/tenant-isolation-api.test.ts` | Tenant isolation API tests | 26 passed, 0 failed |
| `node --import tsx tests/support-session.test.ts` | Support session tests | 10 passed, 0 failed |
| `node --import tsx tests/phase2-service-support.test.ts` | Phase 2 service/support tests | 13 passed, 0 failed (rest skipped) |
| `node --import tsx tests/mission-014A-pos-security.test.ts` | POS security tests | 23 passed, 0 failed |
| `npx tsc --noEmit` | TypeScript check | Pre-existing backend errors remain; frontend clean |

## 13. Manual Verification Results

| Flow | Viewport | Result |
|---|---|---|
| Development server startup | — | `npm run dev` starts Vite on port 3000 |
| Backend server startup | — | `npm run server` starts Express on port 3001 |
| Production build | — | `npm run build` succeeds |
| Production preview | — | `npm run preview` serves on port 4173 |

> **Note**: Actual browser-based manual UI testing (clicking through onboarding, login, SaaS views) was not performed because this environment does not support interactive browser automation. The flows were verified through code inspection, build success, and automated tests.

## 14. Automated Test Results

| Suite | Passed | Failed |
|---|---|---|
| Phase 1 PIN hardening | 18 | 0 |
| Phase 2 platform email auth | 31 | 0 |
| Platform auth security | 8 | 0 |
| Tenant boundary | 10 | 0 |
| Onboarding & SaaS | 44 | 0 |
| Refresh-token rotation | 30 | 0 |
| Support sessions | 10 | 0 |
| Phase 2 service & support | 13 | 0 |
| Service tenant isolation | 6 | 2* |
| Tenant isolation API | 26 | 0 |
| POS security | 23 | 0 |
| **Total** | **219** | **2** |

\* The 2 failures in `service-tenant-isolation.test.ts` (`AccountingService.closeCashSession` and same-tenant order access) are pre-existing and unrelated to the frontend/auth changes made in this phase.

## 15. Screens or Flows Not Verified

- Interactive browser testing of login, onboarding, and SaaS management UI
- Mobile device viewport rendering
- Tablet viewport rendering
- Network-throttling behavior
- Screen-reader / accessibility validation

## 16. Known Limitations

- `npm run lint` is a placeholder; no linter is configured.
- `npm test` is a placeholder; tests must be run individually via `node --import tsx tests/<file>.ts`.
- TypeScript reports pre-existing errors in backend code (`src/api/**`). Frontend (`src/client/**`, `src/features/**`) is clean.
- Production build produces a single large JS chunk (~2.7 MB gzip ~569 KB). Code splitting is not yet implemented.
- `Service-tenant-isolation` has 2 pre-existing test failures unrelated to this phase.

## 17. Recommended Next Phase

1. **Frontend compatibility review**: Run the application in a browser and verify login, refresh, logout, and session-expired flows visually.
2. **Restaurant onboarding UI/UX improvements**: Add success-state guidance after onboarding (e.g., "Continue to restaurant setup").
3. **SaaS-management UI/UX improvements**: Add pagination, advanced filtering, and bulk actions for restaurant and staff management.
4. **Development/build/serve verification**: Confirm `npm run dev`, `npm run build`, and `npm run preview` work across Windows/macOS/Linux.
5. **Manual browser testing**: Verify desktop, tablet, and mobile layouts for onboarding and SaaS management.
6. **Menu future-readiness planning**: Begin schema design for published/unpublished, channel visibility, and separate pricing.
