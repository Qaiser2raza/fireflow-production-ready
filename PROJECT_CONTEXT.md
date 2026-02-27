# PROJECT CONTEXT: Fireflow (Hybrid SaaS Version)
**Current State:** 95% Complete.
**Architecture:**
- **Local Operations**: Core restaurant features (Orders, KDS, Menu) run on **Local PostgreSQL** (Port 5432) via a direct **Node/Express API** (Port 3001).
- **Cloud SaaS**: Business logic (Subscriptions, Licensing, Payments) depends on **Supabase Cloud**.
- **Desktop Wrapper**: Electron integrates the local server and web preview.

**STRICT RULES FOR AI:**
1. **Hybrid Awareness**: Operational data (Orders, etc.) goes to Local API. SaaS data (Subscriptions, etc.) goes via `cloudClient.ts` to Supabase.
2. **Branding**: Maintain the "Fireflow Restaurant" branding for tenants while keeping "Powered by Fireflow" as the SaaS provider badge.
3. **No destructive refactors**: `src/api/server.ts` handles all core local operations. Don't touch it unless fixing bugs.
4. **Bilingual Requirement**: All customer/subscriber notifications must be in English and Urdu.
5. **Ignore Archive**: Stay away from `_ARCHIVE_MIGRATION`.
