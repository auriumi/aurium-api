-- CreateTable
CREATE TABLE "BookingSlot" (
    "id" SERIAL NOT NULL,
    "booking_day_id" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BookingSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingSlot_booking_day_id_start_time_end_time_key" ON "BookingSlot"("booking_day_id", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "BookingSlot_booking_day_id_period_idx" ON "BookingSlot"("booking_day_id", "period");

-- AddForeignKey
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_booking_day_id_fkey" FOREIGN KEY ("booking_day_id") REFERENCES "BookingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "booking_slot_id" INTEGER;

-- CreateIndex
CREATE INDEX "Booking_booking_slot_id_idx" ON "Booking"("booking_slot_id");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_booking_slot_id_fkey" FOREIGN KEY ("booking_slot_id") REFERENCES "BookingSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill hourly slots for existing booking days.
WITH slot_template(period, start_time, end_time, slot_order) AS (
    VALUES
        ('AM', '08:00', '09:00', 1),
        ('AM', '09:00', '10:00', 2),
        ('AM', '10:00', '11:00', 3),
        ('AM', '11:00', '12:00', 4),
        ('PM', '13:00', '14:00', 1),
        ('PM', '14:00', '15:00', 2),
        ('PM', '15:00', '16:00', 3),
        ('PM', '16:00', '17:00', 4)
)
INSERT INTO "BookingSlot" ("booking_day_id", "period", "start_time", "end_time", "capacity", "is_open")
SELECT
    bd."id",
    template."period",
    template."start_time",
    template."end_time",
    CASE template."period"
        WHEN 'AM' THEN FLOOR(bd."max_morning_cap" / 4)::INTEGER + CASE WHEN template."slot_order" <= (bd."max_morning_cap" % 4) THEN 1 ELSE 0 END
        ELSE FLOOR(bd."max_afternoon_cap" / 4)::INTEGER + CASE WHEN template."slot_order" <= (bd."max_afternoon_cap" % 4) THEN 1 ELSE 0 END
    END,
    true
FROM "BookingDay" bd
CROSS JOIN slot_template template
ON CONFLICT ("booking_day_id", "start_time", "end_time") DO NOTHING;

-- Assign existing period-level bookings to hourly slots in a stable round-robin order.
WITH booking_rows AS (
    SELECT
        b."id",
        b."booking_day_id",
        b."period",
        ((ROW_NUMBER() OVER (
            PARTITION BY b."booking_day_id", b."period"
            ORDER BY b."created_at", b."id"
        ) - 1) % 4) + 1 AS slot_order
    FROM "Booking" b
    WHERE b."period" IN ('AM', 'PM')
),
slot_rows AS (
    SELECT
        bs."id",
        bs."booking_day_id",
        bs."period",
        ROW_NUMBER() OVER (
            PARTITION BY bs."booking_day_id", bs."period"
            ORDER BY bs."start_time", bs."id"
        ) AS slot_order
    FROM "BookingSlot" bs
)
UPDATE "Booking" b
SET "booking_slot_id" = slot_rows."id"
FROM booking_rows
JOIN slot_rows
    ON slot_rows."booking_day_id" = booking_rows."booking_day_id"
    AND slot_rows."period" = booking_rows."period"
    AND slot_rows."slot_order" = booking_rows."slot_order"
WHERE b."id" = booking_rows."id";
