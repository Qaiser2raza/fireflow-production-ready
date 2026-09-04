-- M035 Phase 2 Track E: immutable shift-finance review history.
CREATE TYPE "FinanceStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'REJECTED');

CREATE TABLE "finance_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shift_id" UUID NOT NULL,
  "restaurant_id" UUID NOT NULL,
  "business_date" DATE NOT NULL,
  "opening_float" DECIMAL(10,2) NOT NULL,
  "expected_cash" DECIMAL(10,2) NOT NULL,
  "actual_cash" DECIMAL(10,2),
  "difference" DECIMAL(10,2),
  "status" "FinanceStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "confirmed_by" UUID,
  "confirmed_at" TIMESTAMP(6),
  "rejected_by" UUID,
  "rejected_reason" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_entries_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift_sessions"("id") ON DELETE RESTRICT,
  CONSTRAINT "finance_entries_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE,
  CONSTRAINT "finance_entries_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "staff"("id"),
  CONSTRAINT "finance_entries_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "staff"("id")
);

CREATE INDEX "finance_entries_restaurant_id_business_date_idx" ON "finance_entries"("restaurant_id", "business_date");
CREATE INDEX "finance_entries_shift_id_status_idx" ON "finance_entries"("shift_id", "status");
CREATE UNIQUE INDEX "one_pending_finance_per_shift" ON "finance_entries" ("shift_id") WHERE "status" = 'PENDING_REVIEW';
