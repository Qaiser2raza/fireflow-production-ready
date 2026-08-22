-- CreateEnum
CREATE TYPE "PaymentAggregateStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'PROCESSING', 'ACCEPTED', 'COMPLETED', 'RETRYABLE_FAILURE', 'UNKNOWN', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" Decimal(10, 2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'PKR',
    "status" "PaymentAggregateStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(50) NOT NULL,
    "external_reference" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_payments_restaurant_id" ON "payments"("restaurant_id");

-- CreateIndex
CREATE INDEX "idx_payments_order_id" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "idx_payments_restaurant_order" ON "payments"("restaurant_id", "order_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "request_idempotency_key" VARCHAR(100) NOT NULL,
    "provider_idempotency_key" VARCHAR(100) NOT NULL,
    "correlation_id" VARCHAR(100) NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "external_reference" VARCHAR(255),
    "last_error" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_payment_attempts_payment_id" ON "payment_attempts"("payment_id");

-- CreateIndex
CREATE INDEX "idx_payment_attempts_restaurant_id" ON "payment_attempts"("restaurant_id");

-- CreateIndex
CREATE INDEX "idx_payment_attempts_status" ON "payment_attempts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_provider_provider_idempotency_key_key" ON "payment_attempts"("provider", "provider_idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_provider_external_reference_key" ON "payment_attempts"("provider", "external_reference") WHERE "external_reference" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
