-- CreateTable
CREATE TABLE "Student" (
    "id" SERIAL NOT NULL,
    "um_email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "mid_name" TEXT,
    "personal_email" TEXT NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_um_email_key" ON "Student"("um_email");
