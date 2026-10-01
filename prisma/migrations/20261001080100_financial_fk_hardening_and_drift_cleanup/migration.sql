-- PRE-CHECK: Ensure no duplicate payment attempts exist before applying unique constraint:
-- SELECT provider, external_reference, count(*) FROM payment_attempts WHERE external_reference IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;

-- 1. Non-destructive platform_users enum swap
DO $$ BEGIN
    CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_OWNER', 'SUPPORT_ENGINEER', 'SUPPORT_AGENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'LOCKED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "platform_users" ADD COLUMN "role_new" "PlatformRole";
ALTER TABLE "platform_users" ADD COLUMN "status_new" "AccountStatus" DEFAULT 'ACTIVE';

UPDATE "platform_users" SET 
    "role_new" = "role"::text::"PlatformRole",
    "status_new" = "status"::text::"AccountStatus";

ALTER TABLE "platform_users" ALTER COLUMN "role_new" SET NOT NULL;
ALTER TABLE "platform_users" ALTER COLUMN "status_new" SET NOT NULL;

DROP INDEX IF EXISTS "platform_users_role_idx";
DROP INDEX IF EXISTS "platform_users_status_idx";

ALTER TABLE "platform_users" DROP COLUMN "role";
ALTER TABLE "platform_users" DROP COLUMN "status";

ALTER TABLE "platform_users" RENAME COLUMN "role_new" TO "role";
ALTER TABLE "platform_users" RENAME COLUMN "status_new" TO "status";

CREATE INDEX "platform_users_role_idx" ON "platform_users"("role");
CREATE INDEX "platform_users_status_idx" ON "platform_users"("status");

DROP TYPE IF EXISTS "accountstatus";
DROP TYPE IF EXISTS "platformrole";

-- 2. Financial FK Hardening: ON DELETE RESTRICT
-- finance_entries
ALTER TABLE "finance_entries" DROP CONSTRAINT IF EXISTS "finance_entries_restaurant_id_fkey";
ALTER TABLE "finance_entries" DROP CONSTRAINT IF EXISTS "finance_entries_shift_id_fkey";
ALTER TABLE "finance_entries" DROP CONSTRAINT IF EXISTS "finance_entries_confirmed_by_fkey";
ALTER TABLE "finance_entries" DROP CONSTRAINT IF EXISTS "finance_entries_rejected_by_fkey";

ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_restaurant_id_fkey" 
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_shift_id_fkey" 
    FOREIGN KEY ("shift_id") REFERENCES "shift_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_confirmed_by_fkey" 
    FOREIGN KEY ("confirmed_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_rejected_by_fkey" 
    FOREIGN KEY ("rejected_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- payments & payment_attempts
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_restaurant_id_fkey";
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_order_id_fkey";
ALTER TABLE "payment_attempts" DROP CONSTRAINT IF EXISTS "payment_attempts_payment_id_fkey";
ALTER TABLE "payment_attempts" DROP CONSTRAINT IF EXISTS "payment_attempts_restaurant_id_fkey";

ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurant_id_fkey" 
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" 
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_fkey" 
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_restaurant_id_fkey" 
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- fiscal_documents & fiscal_attempts
ALTER TABLE "fiscal_documents" DROP CONSTRAINT IF EXISTS "fiscal_documents_restaurant_id_fkey";
ALTER TABLE "fiscal_documents" DROP CONSTRAINT IF EXISTS "fiscal_documents_order_id_fkey";
ALTER TABLE "fiscal_attempts" DROP CONSTRAINT IF EXISTS "fiscal_attempts_fiscal_document_id_fkey";
ALTER TABLE "fiscal_attempts" DROP CONSTRAINT IF EXISTS "fiscal_attempts_restaurant_id_fkey";

ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_restaurant_id_fkey" 
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_order_id_fkey" 
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_attempts" ADD CONSTRAINT "fiscal_attempts_fiscal_document_id_fkey" 
    FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_attempts" ADD CONSTRAINT "fiscal_attempts_restaurant_id_fkey" 
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- shift_sessions
ALTER TABLE "shift_sessions" DROP CONSTRAINT IF EXISTS "shift_sessions_restaurant_id_fkey";
ALTER TABLE "shift_sessions" DROP CONSTRAINT IF EXISTS "shift_sessions_opened_by_fkey";
ALTER TABLE "shift_sessions" DROP CONSTRAINT IF EXISTS "shift_sessions_closed_by_fkey";

ALTER TABLE "shift_sessions" ADD CONSTRAINT "shift_sessions_restaurant_id_fkey" 
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift_sessions" ADD CONSTRAINT "shift_sessions_opened_by_fkey" 
    FOREIGN KEY ("opened_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift_sessions" ADD CONSTRAINT "shift_sessions_closed_by_fkey" 
    FOREIGN KEY ("closed_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- journal_entries & lines
ALTER TABLE "journal_entries" DROP CONSTRAINT IF EXISTS "journal_entries_restaurant_id_fkey";
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_restaurant_id_fkey" 
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "journal_entry_lines" DROP CONSTRAINT IF EXISTS "journal_entry_lines_journal_entry_id_fkey";
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_fkey" 
    FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Payment attempts external reference: replace partial index with full unique index
-- Original migration created: WHERE "external_reference" IS NOT NULL (partial)
-- Schema now wants a full unique index (no WHERE clause)
DROP INDEX IF EXISTS "payment_attempts_provider_external_reference_key";
CREATE UNIQUE INDEX "payment_attempts_provider_external_reference_key"
    ON "payment_attempts"("provider", "external_reference");

-- 4. Standardize Index Names
ALTER INDEX IF EXISTS "idx_fiscal_attempts_fiscal_document_id" RENAME TO "fiscal_attempts_fiscal_document_id_idx";
ALTER INDEX IF EXISTS "idx_fiscal_attempts_restaurant_id" RENAME TO "fiscal_attempts_restaurant_id_idx";
ALTER INDEX IF EXISTS "idx_fiscal_attempts_status" RENAME TO "fiscal_attempts_status_idx";
ALTER INDEX IF EXISTS "idx_fiscal_documents_order_id" RENAME TO "fiscal_documents_order_id_idx";
ALTER INDEX IF EXISTS "idx_fiscal_documents_restaurant_id" RENAME TO "fiscal_documents_restaurant_id_idx";
ALTER INDEX IF EXISTS "idx_fiscal_documents_restaurant_order" RENAME TO "fiscal_documents_restaurant_id_order_id_idx";
ALTER INDEX IF EXISTS "idx_payment_attempts_payment_id" RENAME TO "payment_attempts_payment_id_idx";
ALTER INDEX IF EXISTS "idx_payment_attempts_restaurant_id" RENAME TO "payment_attempts_restaurant_id_idx";
ALTER INDEX IF EXISTS "idx_payment_attempts_status" RENAME TO "payment_attempts_status_idx";
ALTER INDEX IF EXISTS "idx_payments_order_id" RENAME TO "payments_order_id_idx";
ALTER INDEX IF EXISTS "idx_payments_restaurant_id" RENAME TO "payments_restaurant_id_idx";
ALTER INDEX IF EXISTS "idx_payments_restaurant_order" RENAME TO "payments_restaurant_id_order_id_idx";

-- 5. Drift: FK renames (drop old name, re-add with Prisma canonical name)
-- outbox: original was ON DELETE CASCADE ON UPDATE NO ACTION → change to RESTRICT/CASCADE per schema
ALTER TABLE "outbox" DROP CONSTRAINT IF EXISTS "outbox_restaurant_id_fkey";
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- owner_invites
ALTER TABLE "owner_invites" DROP CONSTRAINT IF EXISTS "owner_invites_restaurant_id_fkey";
ALTER TABLE "owner_invites" ADD CONSTRAINT "owner_invites_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- staff_devices
ALTER TABLE "staff_devices" DROP CONSTRAINT IF EXISTS "staff_devices_staff_id_fkey";
ALTER TABLE "staff_devices" DROP CONSTRAINT IF EXISTS "staff_devices_restaurant_id_fkey";
ALTER TABLE "staff_devices" ADD CONSTRAINT "staff_devices_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_devices" ADD CONSTRAINT "staff_devices_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- refresh_tokens
ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "refresh_tokens_staff_id_fkey";
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- integrations
ALTER TABLE "integrations" DROP CONSTRAINT IF EXISTS "integrations_restaurant_id_fkey";
ALTER TABLE "integrations" DROP CONSTRAINT IF EXISTS "integrations_location_id_fkey";
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- integration_deliveries
ALTER TABLE "integration_deliveries" DROP CONSTRAINT IF EXISTS "integration_deliveries_integration_id_fkey";
ALTER TABLE "integration_deliveries" DROP CONSTRAINT IF EXISTS "integration_deliveries_outbox_id_fkey";
ALTER TABLE "integration_deliveries" DROP CONSTRAINT IF EXISTS "integration_deliveries_restaurant_id_fkey";
ALTER TABLE "integration_deliveries" DROP CONSTRAINT IF EXISTS "integration_deliveries_location_id_fkey";
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_integration_id_fkey"
    FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_outbox_id_fkey"
    FOREIGN KEY ("outbox_id") REFERENCES "outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- password_reset_tokens / platform_sessions / platform_password_history
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT IF EXISTS "password_reset_tokens_platform_user_id_fkey";
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_platform_user_id_fkey"
    FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_sessions" DROP CONSTRAINT IF EXISTS "platform_sessions_platform_user_id_fkey";
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_platform_user_id_fkey"
    FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_password_history" DROP CONSTRAINT IF EXISTS "platform_password_history_platform_user_id_fkey";
ALTER TABLE "platform_password_history" ADD CONSTRAINT "platform_password_history_platform_user_id_fkey"
    FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Drift: Drop obsolete index
DROP INDEX IF EXISTS "platform_sessions_token_family_id_idx";

-- 7. Drift: Timestamp type alignment
ALTER TABLE "platform_users"
    ALTER COLUMN "locked_until" SET DATA TYPE TIMESTAMP(3),
    ALTER COLUMN "last_login" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "refunds" ALTER COLUMN "completed_at" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "restaurants" ALTER COLUMN "onboarding_status" SET DATA TYPE TEXT;

ALTER TABLE "staff"
    ALTER COLUMN "average_delivery_time_minutes" SET DEFAULT 0,
    ALTER COLUMN "locked_until" SET DATA TYPE TIMESTAMP(3),
    ALTER COLUMN "pin_expires_at" SET DATA TYPE TIMESTAMP(3);

-- 8. Drift: Missing indexes
CREATE INDEX IF NOT EXISTS "email_verification_tokens_token_idx" ON "email_verification_tokens"("token");
CREATE INDEX IF NOT EXISTS "staff_password_reset_tokens_token_idx" ON "staff_password_reset_tokens"("token");

-- 9. Drift: Integration / outbox index renames
ALTER INDEX IF EXISTS "idx_integration_deliveries_integration_id" RENAME TO "integration_deliveries_integration_id_idx";
ALTER INDEX IF EXISTS "idx_integration_deliveries_restaurant_id_status" RENAME TO "integration_deliveries_restaurant_id_status_idx";
ALTER INDEX IF EXISTS "idx_integration_deliveries_status_available_at" RENAME TO "integration_deliveries_status_available_at_lock_expires_at_idx";
ALTER INDEX IF EXISTS "idx_integrations_restaurant_id" RENAME TO "integrations_restaurant_id_idx";
ALTER INDEX IF EXISTS "idx_integrations_status" RENAME TO "integrations_restaurant_id_status_idx";
ALTER INDEX IF EXISTS "outbox_idempotency_key" RENAME TO "outbox_aggregate_type_aggregate_id_event_type_key";

