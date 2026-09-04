-- M035 Phase 2 Track D: restaurant-level business-date shifts.
ALTER TABLE "restaurants"
  ADD COLUMN "day_start" VARCHAR(5) NOT NULL DEFAULT '11:00',
  ADD COLUMN "day_end" VARCHAR(5) NOT NULL DEFAULT '01:00';

CREATE TYPE "ShiftStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED');

CREATE TABLE "shift_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "restaurant_id" UUID NOT NULL,
  "business_date" DATE NOT NULL,
  "day_start" TIMESTAMP(6) NOT NULL,
  "day_end" TIMESTAMP(6),
  "status" "ShiftStatus" NOT NULL DEFAULT 'DRAFT',
  "opening_float" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "expected_cash" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "actual_cash" DECIMAL(10,2),
  "difference" DECIMAL(10,2),
  "terminal_id" VARCHAR(100),
  "notes" TEXT,
  "opened_by" UUID NOT NULL,
  "closed_by" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shift_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shift_sessions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE,
  CONSTRAINT "shift_sessions_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "staff"("id"),
  CONSTRAINT "shift_sessions_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "staff"("id")
);

CREATE INDEX "shift_sessions_restaurant_id_business_date_idx" ON "shift_sessions"("restaurant_id", "business_date");
CREATE INDEX "shift_sessions_restaurant_id_status_idx" ON "shift_sessions"("restaurant_id", "status");
CREATE UNIQUE INDEX "one_open_shift_per_day" ON "shift_sessions" ("restaurant_id", "business_date") WHERE "status" = 'OPEN';
