-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('REGISTERED', 'APPROVED', 'BOOKED', 'ATTENDED', 'FULLY_VERIFIED');

-- CreateEnum
CREATE TYPE "AdminActions" AS ENUM ('APPROVED', 'VERIFIED', 'UPLOADED');

-- CreateTable
CREATE TABLE "Student" (
    "id" SERIAL NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "mid_name" TEXT,
    "school_email" TEXT NOT NULL,
    "personal_email" TEXT NOT NULL,
    "department" TEXT,
    "course" TEXT,
    "major" TEXT,
    "nickname" TEXT,
    "suffix" TEXT,
    "thesis_title" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "student_number" INTEGER NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentDetail" (
    "id" INTEGER NOT NULL,
    "birth_date" TIMESTAMP(3) NOT NULL,
    "province" TEXT,
    "city" TEXT,
    "barangay" TEXT,
    "mothers_name" TEXT,
    "mothers_title" TEXT,
    "fathers_name" TEXT,
    "fathers_title" TEXT,
    "guardians_name" TEXT,
    "guardians_title" TEXT,
    "contact_num" TEXT,
    "photo_url" TEXT,

    CONSTRAINT "StudentDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentAuth" (
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_new" BOOLEAN NOT NULL DEFAULT true,
    "hashed_password" TEXT,
    "last_login" TIMESTAMP(3),
    "student_number" INTEGER NOT NULL,
    "status" "StudentStatus" NOT NULL DEFAULT 'REGISTERED',

    CONSTRAINT "StudentAuth_pkey" PRIMARY KEY ("student_number")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "hashed_password" TEXT NOT NULL,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Logs" (
    "id" SERIAL NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "action" "AdminActions" NOT NULL,
    "target_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingDay" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "max_morning_cap" INTEGER NOT NULL,
    "max_afternoon_cap" INTEGER NOT NULL,

    CONSTRAINT "BookingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" SERIAL NOT NULL,
    "student_number" INTEGER NOT NULL,
    "booking_day_id" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_school_email_key" ON "Student"("school_email");

-- CreateIndex
CREATE UNIQUE INDEX "Student_student_number_key" ON "Student"("student_number");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BookingDay_date_key" ON "BookingDay"("date");

-- AddForeignKey
ALTER TABLE "StudentDetail" ADD CONSTRAINT "StudentDetail_id_fkey" FOREIGN KEY ("id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAuth" ADD CONSTRAINT "StudentAuth_student_number_fkey" FOREIGN KEY ("student_number") REFERENCES "Student"("student_number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Logs" ADD CONSTRAINT "Logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Logs" ADD CONSTRAINT "Logs_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "Student"("student_number") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_booking_day_id_fkey" FOREIGN KEY ("booking_day_id") REFERENCES "BookingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_student_number_fkey" FOREIGN KEY ("student_number") REFERENCES "Student"("student_number") ON DELETE CASCADE ON UPDATE CASCADE;

