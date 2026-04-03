-- CreateTable
CREATE TABLE "cashier_shift_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(50),
    "reference_id" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "processed_by" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashier_shift_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cashier_shift_logs" ADD CONSTRAINT "cashier_shift_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_shift_logs" ADD CONSTRAINT "cashier_shift_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cashier_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_shift_logs" ADD CONSTRAINT "cashier_shift_logs_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
