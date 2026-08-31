-- M031-B Phase B: Add unique constraint for ORDER_COGS idempotency
-- Prevents duplicate COGS journals from being created for the same order
-- Uses partial unique index scoped to ORDER_COGS reference_type

CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_order_cogs_key" 
ON "journal_entries" (reference_type, reference_id) 
WHERE reference_type = 'ORDER_COGS';