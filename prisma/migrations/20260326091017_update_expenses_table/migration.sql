/*
  Warnings:

  - You are about to drop the column `date` on the `expenses` table. All the data in the column will be lost.
  - You are about to drop the column `staff_id` on the `expenses` table. All the data in the column will be lost.
  - The `category` column on the `expenses` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Made the column `restaurant_id` on table `expenses` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('UTILITIES', 'SALARY', 'MAINTENANCE', 'SUPPLIES', 'MARKETING', 'RENT', 'TRANSPORT', 'MISCELLANEOUS');

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_restaurant_id_fkey";

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_staff_id_fkey";

-- AlterTable
ALTER TABLE "expenses" DROP COLUMN "date",
DROP COLUMN "staff_id",
ADD COLUMN     "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "processed_by" UUID,
ADD COLUMN     "reference_id" VARCHAR(100),
ALTER COLUMN "restaurant_id" SET NOT NULL,
ALTER COLUMN "description" SET DATA TYPE TEXT,
DROP COLUMN "category",
ADD COLUMN     "category" "ExpenseCategory" NOT NULL DEFAULT 'MISCELLANEOUS';

-- CreateIndex
CREATE INDEX "expenses_restaurant_id_idx" ON "expenses"("restaurant_id");

-- CreateIndex
CREATE INDEX "expenses_created_at_idx" ON "expenses"("created_at");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
