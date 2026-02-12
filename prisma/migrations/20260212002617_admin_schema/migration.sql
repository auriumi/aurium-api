-- CreateTable
CREATE TABLE "Admin" (
    "id" INTEGER NOT NULL,
    "email" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "hashed_password" TEXT NOT NULL,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Logs" (
    "id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- AddForeignKey
ALTER TABLE "Logs" ADD CONSTRAINT "Logs_id_fkey" FOREIGN KEY ("id") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
