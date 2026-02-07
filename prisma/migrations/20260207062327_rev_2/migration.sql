/*
  Warnings:

  - You are about to drop the column `birth_date` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `student_number` on the `StudentAuth` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[student_number]` on the table `Student` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `student_number` to the `Student` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "StudentAuth_student_number_key";

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "birth_date",
ADD COLUMN     "student_number" INTEGER NOT NULL,
ALTER COLUMN "first_name" DROP NOT NULL,
ALTER COLUMN "last_name" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StudentAuth" DROP COLUMN "student_number";

-- CreateTable
CREATE TABLE "StudentDetail" (
    "id" INTEGER NOT NULL,
    "birth_date" TIMESTAMP(3) NOT NULL,
    "province" TEXT,
    "city" TEXT,
    "barangay" TEXT,
    "mothers_name" TEXT,
    "fathers_name" TEXT,
    "contact_num" INTEGER,

    CONSTRAINT "StudentDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentDetail_id_key" ON "StudentDetail"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Student_student_number_key" ON "Student"("student_number");

-- AddForeignKey
ALTER TABLE "StudentDetail" ADD CONSTRAINT "StudentDetail_id_fkey" FOREIGN KEY ("id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
