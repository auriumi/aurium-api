-- DropForeignKey
ALTER TABLE "StudentAuth" DROP CONSTRAINT "StudentAuth_student_number_fkey";

-- DropForeignKey
ALTER TABLE "StudentDetail" DROP CONSTRAINT "StudentDetail_id_fkey";

-- AlterTable
ALTER TABLE "StudentAuth" ADD COLUMN     "status" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "BookingDay" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "is_open" BOOLEAN NOT NULL,
    "curr_morning" INTEGER NOT NULL,
    "curr_afternoon" INTEGER NOT NULL,
    "max_morning_cap" INTEGER NOT NULL,
    "max_afternoon_cap" INTEGER NOT NULL,

    CONSTRAINT "BookingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "student_number" INTEGER NOT NULL,
    "booking_day_id" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("student_number")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingDay_date_key" ON "BookingDay"("date");

-- AddForeignKey
ALTER TABLE "StudentDetail" ADD CONSTRAINT "StudentDetail_id_fkey" FOREIGN KEY ("id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAuth" ADD CONSTRAINT "StudentAuth_student_number_fkey" FOREIGN KEY ("student_number") REFERENCES "Student"("student_number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_booking_day_id_fkey" FOREIGN KEY ("booking_day_id") REFERENCES "BookingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_student_number_fkey" FOREIGN KEY ("student_number") REFERENCES "Student"("student_number") ON DELETE CASCADE ON UPDATE CASCADE;
