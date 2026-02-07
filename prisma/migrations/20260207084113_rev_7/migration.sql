/*
  Warnings:

  - The primary key for the `StudentAuth` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `StudentAuth` table. All the data in the column will be lost.
  - Added the required column `student_number` to the `StudentAuth` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "StudentAuth" DROP CONSTRAINT "StudentAuth_id_fkey";

-- DropIndex
DROP INDEX "StudentAuth_id_key";

-- AlterTable
ALTER TABLE "StudentAuth" DROP CONSTRAINT "StudentAuth_pkey",
DROP COLUMN "id",
ADD COLUMN     "student_number" INTEGER NOT NULL,
ADD CONSTRAINT "StudentAuth_pkey" PRIMARY KEY ("student_number");

-- AddForeignKey
ALTER TABLE "StudentAuth" ADD CONSTRAINT "StudentAuth_student_number_fkey" FOREIGN KEY ("student_number") REFERENCES "Student"("student_number") ON DELETE RESTRICT ON UPDATE CASCADE;
