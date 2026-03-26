/*
  Warnings:

  - Added the required column `reference_id` to the `journal_entry_lines` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reference_type` to the `journal_entry_lines` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "chart_of_accounts" ADD COLUMN     "is_system" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "journal_entry_lines" ADD COLUMN     "meta" JSONB,
ADD COLUMN     "reference_id" VARCHAR(100) NOT NULL,
ADD COLUMN     "reference_type" VARCHAR(50) NOT NULL;
