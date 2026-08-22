-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "aggregate_type" VARCHAR(50) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
    "last_error" TEXT,
    "lock_owner" VARCHAR(100),
    "lock_expires_at" TIMESTAMP(6),
    "occurred_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
    "processed_at" TIMESTAMP(6),
    "processed_by" VARCHAR(100),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_status_available_at_lock_expires_at_idx" ON "outbox"("status", "available_at", "lock_expires_at");

-- CreateIndex
CREATE INDEX "outbox_restaurant_id_idx" ON "outbox"("restaurant_id");

-- CreateIndex
CREATE INDEX "outbox_event_type_idx" ON "outbox"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_idempotency_key" ON "outbox"("aggregate_type", "aggregate_id", "event_type");

-- AddForeignKey
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
