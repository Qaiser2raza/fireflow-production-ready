-- Task 03b: bind an owner session to exactly one restaurant.
--
-- Nullable on purpose: rows created before this migration have no tenant. Such a
-- row is treated as invalid by the refresh path (the family is revoked and the
-- user must sign in again), it is never resolved from memberships.
--
-- Additive only: new nullable column, new index, new FK. No data is rewritten
-- and no existing migration is modified.

-- AlterTable
ALTER TABLE "user_sessions" ADD COLUMN     "restaurant_id" UUID;

-- CreateIndex
CREATE INDEX "user_sessions_restaurant_id_idx" ON "user_sessions"("restaurant_id");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
