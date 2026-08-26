-- M021: provider-attempt single-claim race (design:
-- docs/work-in-progress/PROVIDER_ATTEMPT_RACE_DESIGN.md, rev1 APPROVED 2026-08-26).
--
-- Additive only. New nullable `settle_line_key` carries the deterministic
-- logical-line identity SETTLE_LINE:{tenant}:{order}:{METHOD}; the unique
-- index admits exactly ONE payments aggregate per line (L1 of PA-1).
-- Existing billing/A1/SaaS rows are unaffected because the column is
-- nullable — Postgres treats NULLs as distinct in a unique index.

ALTER TABLE "payments" ADD COLUMN "settle_line_key" VARCHAR(120);
CREATE UNIQUE INDEX "payments_settle_line_key_key" ON "payments"("settle_line_key");
