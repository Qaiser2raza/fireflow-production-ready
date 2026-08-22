-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'ACCEPTED', 'COMPLETED', 'RETRYABLE_FAILURE', 'UNKNOWN', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "location_id" UUID,
    "connector_type" VARCHAR(50) NOT NULL,
    "connector_version" VARCHAR(50),
    "status" "IntegrationStatus" NOT NULL DEFAULT 'ENABLED',
    "configuration_reference" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_integrations_restaurant_id" ON "integrations"("restaurant_id");

-- CreateIndex
CREATE INDEX "idx_integrations_status" ON "integrations"("restaurant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_restaurant_id_location_id_connector_type_key" ON "integrations"("restaurant_id", "location_id", "connector_type");

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- CreateTable
CREATE TABLE "integration_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integration_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "location_id" UUID,
    "outbox_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "correlation_id" VARCHAR(100) NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
    "last_error" TEXT,
    "external_reference" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
    "completed_at" TIMESTAMP(6),
    "lock_owner" VARCHAR(100),
    "lock_expires_at" TIMESTAMP(6),

    CONSTRAINT "integration_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_integration_deliveries_integration_id" ON "integration_deliveries"("integration_id");

-- CreateIndex
CREATE INDEX "idx_integration_deliveries_restaurant_id_status" ON "integration_deliveries"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "idx_integration_deliveries_status_available_at" ON "integration_deliveries"("status", "available_at", "lock_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "integration_deliveries_integration_id_outbox_id_key" ON "integration_deliveries"("integration_id", "outbox_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_deliveries_integration_id_idempotency_key_key" ON "integration_deliveries"("integration_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "integration_deliveries" ADD CONSTRAINT "integration_deliveries_outbox_id_fkey" FOREIGN KEY ("outbox_id") REFERENCES "outbox"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
