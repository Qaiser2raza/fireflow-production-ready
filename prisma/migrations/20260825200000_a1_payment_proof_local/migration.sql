-- A1: payment-proof submission (local durable evidence fact).
-- Deterministic proof identity rides the existing unique column:
-- subscription_payments.transaction_id carries sha256 of
-- restaurant_id|billing_period|method|amount_minor|client_token.
ALTER TABLE "subscription_payments" ADD COLUMN "billing_period" VARCHAR(7);
ALTER TABLE "subscription_payments" ADD COLUMN "reference_note" VARCHAR(255);
ALTER TABLE "subscription_payments" ADD COLUMN "submitted_by" UUID;
