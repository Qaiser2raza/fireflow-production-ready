/*
  Warnings:

  - You are about to drop the `cash_sessions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "cash_sessions" DROP CONSTRAINT "cash_sessions_restaurant_id_fkey";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "session_id" UUID;

-- DropTable
DROP TABLE "cash_sessions";

-- CreateTable
CREATE TABLE "cashier_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "opened_by" UUID NOT NULL,
    "closed_by" UUID,
    "opened_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(6),
    "opening_float" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "expected_cash" DECIMAL(10,2),
    "actual_cash" DECIMAL(10,2),
    "difference" DECIMAL(10,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,

    CONSTRAINT "cashier_sessions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cashier_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
