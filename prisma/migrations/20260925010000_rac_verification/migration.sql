-- CreateEnum
CREATE TYPE "RacOutcome" AS ENUM ('VERIFIED', 'NOT_LISTED');

-- CreateEnum
CREATE TYPE "ReviewTrackType" AS ENUM ('INFORMATION', 'PHOTOS');

-- CreateEnum
CREATE TYPE "ReviewStage" AS ENUM ('DRAFT', 'SUBMITTED_QC', 'REJECTED_QC', 'APPROVED_QC', 'SUBMITTED_MODERATOR', 'REJECTED_MODERATOR', 'LOCKED');

-- CreateEnum
CREATE TYPE "ReviewEventAction" AS ENUM ('RAC_VERIFIED', 'RAC_NOT_LISTED');

-- CreateTable
CREATE TABLE "ReviewCase" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "grad_year" INTEGER NOT NULL,
    "grad_term" "GraduationTerm" NOT NULL,
    "outcome" "RacOutcome" NOT NULL,
    "checked_by" INTEGER NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_version" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ReviewCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTrack" (
    "id" SERIAL NOT NULL,
    "case_id" INTEGER NOT NULL,
    "type" "ReviewTrackType" NOT NULL,
    "stage" "ReviewStage" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ReviewTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewOperation" (
    "id" SERIAL NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "client_key" UUID NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewEvent" (
    "id" SERIAL NOT NULL,
    "case_id" INTEGER NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "operation_id" INTEGER NOT NULL,
    "action" "ReviewEventAction" NOT NULL,
    "previous_outcome" "RacOutcome",
    "new_outcome" "RacOutcome" NOT NULL,
    "source_version" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewCase_outcome_grad_year_grad_term_idx" ON "ReviewCase"("outcome", "grad_year", "grad_term");

-- CreateIndex
CREATE INDEX "ReviewCase_checked_by_idx" ON "ReviewCase"("checked_by");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCase_student_id_grad_year_grad_term_key" ON "ReviewCase"("student_id", "grad_year", "grad_term");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewTrack_case_id_type_key" ON "ReviewTrack"("case_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewOperation_actor_id_client_key_key" ON "ReviewOperation"("actor_id", "client_key");

-- CreateIndex
CREATE INDEX "ReviewEvent_case_id_created_at_idx" ON "ReviewEvent"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "ReviewEvent_actor_id_idx" ON "ReviewEvent"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewEvent_operation_id_case_id_key" ON "ReviewEvent"("operation_id", "case_id");

-- AddForeignKey
ALTER TABLE "ReviewCase" ADD CONSTRAINT "ReviewCase_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCase" ADD CONSTRAINT "ReviewCase_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTrack" ADD CONSTRAINT "ReviewTrack_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "ReviewCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewOperation" ADD CONSTRAINT "ReviewOperation_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "ReviewCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "ReviewOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReviewCase" ADD CONSTRAINT "ReviewCase_cycle_version_check" CHECK (
    "grad_year" BETWEEN 2000 AND 2100 AND "version" > 0
);

ALTER TABLE "ReviewTrack" ADD CONSTRAINT "ReviewTrack_version_check" CHECK ("version" > 0);

ALTER TABLE "ReviewOperation" ADD CONSTRAINT "ReviewOperation_hash_check" CHECK (
    char_length("request_hash") = 64
);

ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_outcome_action_check" CHECK (
    ("action" = 'RAC_VERIFIED' AND "new_outcome" = 'VERIFIED') OR
    ("action" = 'RAC_NOT_LISTED' AND "new_outcome" = 'NOT_LISTED')
);
