/*
  Warnings:

  - You are about to drop the column `um_email` on the `Student` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[student_number]` on the table `Student` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[school_email]` on the table `Student` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `birth_date` to the `Student` table without a default value. This is not possible if the table is not empty.
  - Added the required column `school_email` to the `Student` table without a default value. This is not possible if the table is not empty.
  - Added the required column `student_number` to the `Student` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Student` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Student_um_email_key";

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "um_email",
ADD COLUMN     "birth_date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "course" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "major" TEXT,
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "school_email" TEXT NOT NULL,
ADD COLUMN     "student_number" INTEGER NOT NULL,
ADD COLUMN     "suffix" TEXT,
ADD COLUMN     "thesis_title" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Student_student_number_key" ON "Student"("student_number");

-- CreateIndex
CREATE UNIQUE INDEX "Student_school_email_key" ON "Student"("school_email");

-- CreateIndex
CREATE INDEX "Student_student_number_idx" ON "Student"("student_number");
