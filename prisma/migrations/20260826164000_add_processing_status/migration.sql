-- M021: add PROCESSING to PaymentAggregateStatus enum.
-- Additive only; existing rows keep their current value.
ALTER TYPE "PaymentAggregateStatus" ADD VALUE 'PROCESSING';
