# PROJECT CONTEXT: Fireflow (Local Server Version)
**Current State:** 80% Complete. Migration from Supabase to Local SQLite/Postgres is DONE.
**Architecture:**
- Frontend: React + Vite (located in /src)
- Backend: Local Node/Express Server (located in /src/api/server.ts)
- Desktop Wrapper: Electron (located in /electron)
- DB: Prisma (Local)

**STRICT RULES FOR AI:**
1. DO NOT suggest Cloud/Supabase solutions. We are 100% local now.
2. DO NOT refactor `src/api/server.ts` or `db.ts` unless explicitly asked. They are working.
3. If working on Frontend, do not touch the `/src/api` folder unless necessary.
4. If working on Backend, do not touch the `/src/features` (Frontend) folders.
5. IGNORE any files in `_ARCHIVE_MIGRATION`.
