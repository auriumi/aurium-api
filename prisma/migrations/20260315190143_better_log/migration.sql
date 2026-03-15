/*
  Warnings:

  - Added the required column `admin_id` to the `Logs` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `action` on the `Logs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AdminActions" AS ENUM ('APPROVED', 'VERIFIED', 'UPLOADED');

-- DropForeignKey
ALTER TABLE "Logs" DROP CONSTRAINT "Logs_id_fkey";

-- AlterTable
ALTER TABLE "Logs" ADD COLUMN     "admin_id" INTEGER NOT NULL,
ADD COLUMN     "target_id" INTEGER,
DROP COLUMN "action",
ADD COLUMN     "action" "AdminActions" NOT NULL;

-- AddForeignKey
ALTER TABLE "Logs" ADD CONSTRAINT "Logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Logs" ADD CONSTRAINT "Logs_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "Student"("student_number") ON DELETE SET NULL ON UPDATE CASCADE;
