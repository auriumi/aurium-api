/*
  Warnings:

  - You are about to drop the column `curr_afternoon` on the `BookingDay` table. All the data in the column will be lost.
  - You are about to drop the column `curr_morning` on the `BookingDay` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "BookingDay" DROP COLUMN "curr_afternoon",
DROP COLUMN "curr_morning";
