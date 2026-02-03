/*
  Warnings:

  - The primary key for the `StudentAuth` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `student_id` on the `StudentAuth` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[id]` on the table `StudentAuth` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `id` to the `StudentAuth` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "StudentAuth" DROP CONSTRAINT "StudentAuth_student_id_fkey";

-- DropIndex
DROP INDEX "StudentAuth_student_id_key";

-- AlterTable
ALTER TABLE "StudentAuth" DROP CONSTRAINT "StudentAuth_pkey",
DROP COLUMN "student_id",
ADD COLUMN     "id" INTEGER NOT NULL,
ADD CONSTRAINT "StudentAuth_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAuth_id_key" ON "StudentAuth"("id");

-- AddForeignKey
ALTER TABLE "StudentAuth" ADD CONSTRAINT "StudentAuth_id_fkey" FOREIGN KEY ("id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
