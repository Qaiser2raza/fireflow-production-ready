-- Corrective alignment: support_sessions + audit_logs support columns
--
-- Migration `20260816000000_add_support_sessions` created these columns as
-- TEXT, while `prisma/schema.prisma` declares UUID / SupportSessionStatus.
-- Databases built via `prisma migrate deploy` therefore diverge from the
-- schema: UUID-shaped strings insert silently into TEXT, and non-UUID
-- fixture values only fail on `db push`-built databases.
--
-- Explicit USING casts are mandatory per authorization: any historical
-- value that is not a valid UUID must abort this migration loudly instead
-- of being silently cast or dropped. Fresh databases contain no rows and
-- pass through unchanged structurally.
--
-- Notes:
-- - No FK constraints exist on these columns (schema declares none); only
--   indexes, which PostgreSQL rebuilds automatically during ALTER TYPE.
-- - `id` keeps its gen_random_uuid() default (valid for uuid).
-- - "SupportSessionStatus" already exists (created by 20260816000000).

ALTER TABLE "support_sessions" ALTER COLUMN "id" SET DATA TYPE UUID USING "id"::UUID;
ALTER TABLE "support_sessions" ALTER COLUMN "platform_user_id" SET DATA TYPE UUID USING "platform_user_id"::UUID;
ALTER TABLE "support_sessions" ALTER COLUMN "restaurant_id" SET DATA TYPE UUID USING "restaurant_id"::UUID;
ALTER TABLE "support_sessions" ALTER COLUMN "created_by" SET DATA TYPE UUID USING "created_by"::UUID;

-- The stored TEXT default 'ACTIVE' cannot be cast automatically to the enum
-- type during ALTER COLUMN TYPE; drop it, convert, and re-add.
ALTER TABLE "support_sessions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "support_sessions" ALTER COLUMN "status" SET DATA TYPE "SupportSessionStatus" USING "status"::"SupportSessionStatus";
ALTER TABLE "support_sessions" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "audit_logs" ALTER COLUMN "platform_actor_id" SET DATA TYPE UUID USING "platform_actor_id"::UUID;
ALTER TABLE "audit_logs" ALTER COLUMN "support_session_id" SET DATA TYPE UUID USING "support_session_id"::UUID;
