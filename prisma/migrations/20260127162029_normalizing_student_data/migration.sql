/*
  Warnings:

  - You are about to drop the column `student_number` on the `Student` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Student_student_number_idx";

-- DropIndex
DROP INDEX "Student_student_number_key";

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "student_number";

-- CreateTable
CREATE TABLE "StudentNumber" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "student_number" INTEGER,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StudentNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentNumber_student_id_key" ON "StudentNumber"("student_id");

-- AddForeignKey
ALTER TABLE "StudentNumber" ADD CONSTRAINT "StudentNumber_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
