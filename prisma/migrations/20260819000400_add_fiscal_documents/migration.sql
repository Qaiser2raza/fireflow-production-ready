-- CreateEnum
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('PENDING', 'ISSUED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FiscalAttemptStatus" AS ENUM ('PENDING', 'PROCESSING', 'ACCEPTED', 'COMPLETED', 'RETRYABLE_FAILURE', 'UNKNOWN', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "fiscal_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "document_type" VARCHAR(50) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'PKR',
    "subtotal" Decimal(10, 2) NOT NULL,
    "tax_total" Decimal(10, 2) NOT NULL,
    "grand_total" Decimal(10, 2) NOT NULL,
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "provider_type" VARCHAR(50) NOT NULL,
    "provider_reference" VARCHAR(255),
    "issued_at" TIMESTAMP(6),
    "correlation_id" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_fiscal_documents_restaurant_id" ON "fiscal_documents"("restaurant_id");

-- CreateIndex
CREATE INDEX "idx_fiscal_documents_order_id" ON "fiscal_documents"("order_id");

-- CreateIndex
CREATE INDEX "idx_fiscal_documents_restaurant_order" ON "fiscal_documents"("restaurant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_restaurant_id_order_id_document_type_key" ON "fiscal_documents"("restaurant_id", "order_id", "document_type");

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- CreateTable
CREATE TABLE "fiscal_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fiscal_document_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "provider_type" VARCHAR(50) NOT NULL,
    "status" "FiscalAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" VARCHAR(100) NOT NULL,
    "external_reference" VARCHAR(255),
    "last_error" TEXT,
    "correlation_id" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "fiscal_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_fiscal_attempts_fiscal_document_id" ON "fiscal_attempts"("fiscal_document_id");

-- CreateIndex
CREATE INDEX "idx_fiscal_attempts_restaurant_id" ON "fiscal_attempts"("restaurant_id");

-- CreateIndex
CREATE INDEX "idx_fiscal_attempts_status" ON "fiscal_attempts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_attempts_provider_type_idempotency_key_key" ON "fiscal_attempts"("provider_type", "idempotency_key");

-- AddForeignKey
ALTER TABLE "fiscal_attempts" ADD CONSTRAINT "fiscal_attempts_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fiscal_attempts" ADD CONSTRAINT "fiscal_attempts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
