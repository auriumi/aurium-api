/*
  Warnings:

  - You are about to drop the `StudentNumber` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "StudentNumber" DROP CONSTRAINT "StudentNumber_student_id_fkey";

-- DropTable
DROP TABLE "StudentNumber";

-- CreateTable
CREATE TABLE "StudentAuth" (
    "student_id" INTEGER NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "student_number" INTEGER NOT NULL,
    "hashed_password" TEXT,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "StudentAuth_pkey" PRIMARY KEY ("student_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentAuth_student_id_key" ON "StudentAuth"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAuth_student_number_key" ON "StudentAuth"("student_number");

-- AddForeignKey
ALTER TABLE "StudentAuth" ADD CONSTRAINT "StudentAuth_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
