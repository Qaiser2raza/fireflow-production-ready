-- Task 04 (04-1): tenant lifecycle status.
--
-- restaurants.subscription_status was free text ('trial' / 'active' / 'ACTIVE' /
-- 'expired' were all in use). It becomes the enum SubscriptionStatus, which is the
-- single source of truth for tenant access in the main Postgres database. Supabase
-- and license.lic are explicitly NOT sources for this status.
--
-- Additive only: a new enum type, a column type conversion, one new index and one
-- new table. No existing migration is modified and no existing row is deleted.
--
-- PRE-CHECK (run this by hand before applying; the DO block below fails closed):
--
--   SELECT subscription_status, count(*)
--   FROM restaurants
--   GROUP BY subscription_status
--   ORDER BY 1;
--
-- Only 'trial', 'active', 'ACTIVE' and 'expired' may exist. Any other value aborts
-- the migration with RAISE EXCEPTION instead of being guessed at.

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'PENDING_REVIEW', 'ACTIVE', 'GRACE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SubscriptionActorType" AS ENUM ('SYSTEM', 'SUPER_ADMIN', 'OWNER');

-- Fail closed on unmapped values before touching the column.
DO $$
DECLARE
    unmapped text[];
BEGIN
    SELECT array_agg(DISTINCT subscription_status)
      INTO unmapped
      FROM restaurants
     WHERE subscription_status IS DISTINCT FROM 'trial'
       AND subscription_status IS DISTINCT FROM 'active'
       AND subscription_status IS DISTINCT FROM 'ACTIVE'
       AND subscription_status IS DISTINCT FROM 'expired';

    IF unmapped IS NOT NULL THEN
        RAISE EXCEPTION 'Unmapped restaurants.subscription_status values found: %. Only trial, active, ACTIVE and expired can be mapped.', unmapped;
    END IF;
END $$;

-- Explicit value map. 'expired' meant "past its period with no renewal": it is a
-- hard stop today, so it lands on SUSPENDED (read-only) rather than being silently
-- upgraded to an active tenant.
UPDATE "restaurants"
   SET "subscription_status" = CASE "subscription_status"
        WHEN 'trial'  THEN 'TRIAL'
        WHEN 'active' THEN 'ACTIVE'
        WHEN 'ACTIVE' THEN 'ACTIVE'
        WHEN 'expired' THEN 'SUSPENDED'
        ELSE "subscription_status"
   END
 WHERE "subscription_status" IN ('trial', 'active', 'ACTIVE', 'expired');

-- A trial tenant without a trial end can never leave TRIAL, because access is
-- derived from dates on read. Backfill the documented 14-day trial.
UPDATE "restaurants"
   SET "trial_ends_at" = COALESCE("trial_ends_at", "created_at" + interval '14 days')
 WHERE "subscription_status" = 'TRIAL'
   AND "trial_ends_at" IS NULL;

-- The seeded demo tenant ships with a valid license and is provisioned as ACTIVE.
UPDATE "restaurants"
   SET "subscription_status" = 'ACTIVE',
       "subscription_expires_at" = COALESCE("subscription_expires_at", now() + interval '30 days')
 WHERE "id" = 'b1972d7d-8374-4b55-9580-95a15f18f656';

-- AlterTable
ALTER TABLE "restaurants" ALTER COLUMN "subscription_status" DROP DEFAULT;
ALTER TABLE "restaurants" ALTER COLUMN "subscription_status" SET DATA TYPE "SubscriptionStatus" USING ("subscription_status"::"SubscriptionStatus");
ALTER TABLE "restaurants" ALTER COLUMN "subscription_status" SET DEFAULT 'TRIAL';

-- CreateIndex
CREATE INDEX "restaurants_subscription_status_idx" ON "restaurants"("subscription_status");

-- CreateTable: append-only status history. RESTRICT, never CASCADE: a tenant's
-- lifecycle history outlives the tenant row it describes.
CREATE TABLE "subscription_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "from_status" "SubscriptionStatus",
    "to_status" "SubscriptionStatus" NOT NULL,
    "actor_type" "SubscriptionActorType" NOT NULL,
    "actor_id" VARCHAR(255),
    "reason" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_events_restaurant_id_created_at_idx" ON "subscription_events"("restaurant_id", "created_at");

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;