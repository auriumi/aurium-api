/*
  Warnings:

  - The primary key for the `StudentNumber` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `StudentNumber` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[student_number]` on the table `StudentNumber` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `student_number` to the `StudentNumber` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "StudentNumber" DROP CONSTRAINT "StudentNumber_pkey",
DROP COLUMN "id",
ADD COLUMN     "student_number" INTEGER NOT NULL,
ADD CONSTRAINT "StudentNumber_pkey" PRIMARY KEY ("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "StudentNumber_student_number_key" ON "StudentNumber"("student_number");
