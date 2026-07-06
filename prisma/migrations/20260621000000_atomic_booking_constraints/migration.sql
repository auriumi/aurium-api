DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Booking"
    GROUP BY "student_number"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce one booking per student while duplicate bookings exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX "Booking_student_number_key"
ON "Booking"("student_number");

CREATE INDEX "Booking_booking_day_id_period_idx"
ON "Booking"("booking_day_id", "period");
