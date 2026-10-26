-- MANUAL SETUP REFERENCE ONLY. Never invoked by CI, startup or Prisma migrate.
-- For Koi: confirm database/schema, back up, and rehearse in the shared test DB.
-- Run only when BOTH target tables are absent and the existing review schema is ready.
-- If tables already exist, STOP and inspect their definitions; do not drop/recreate them.
-- Execute the whole file with stop-on-error enabled. It contains no graduate data writes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = current_schema()
        AND tablename IN ('ProofreadingDailyTarget', 'ProofreadingTargetChange')) THEN
        RAISE EXCEPTION 'Target tables already exist: inspect schema, do not recreate or reset them';
    END IF;
    IF to_regclass('"ReviewAssignment"') IS NULL OR to_regclass('"ReviewTrack"') IS NULL
        OR to_regclass('"ReviewOperation"') IS NULL OR to_regclass('"InformationReviewEvent"') IS NULL
        OR to_regclass('"PhotoReviewEvent"') IS NULL THEN
        RAISE EXCEPTION 'Existing review schema is missing: confirm the database before target setup';
    END IF;
END;
$$;

-- CreateTable
CREATE TABLE "ProofreadingDailyTarget" (
    "id" SERIAL NOT NULL,
    "staff_id" INTEGER NOT NULL,
    "capability" "ReviewCapability" NOT NULL DEFAULT 'INFORMATION_PROOFREADER',
    "grad_year" INTEGER NOT NULL,
    "grad_term" "GraduationTerm" NOT NULL,
    "target_date" DATE NOT NULL,
    "target_count" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProofreadingDailyTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofreadingTargetChange" (
    "id" SERIAL NOT NULL,
    "target_id" INTEGER NOT NULL,
    "changed_by" INTEGER NOT NULL,
    "previous_count" INTEGER,
    "new_count" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "operation_id" INTEGER NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofreadingTargetChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProofreadingDailyTarget_grad_year_grad_term_target_date_idx" ON "ProofreadingDailyTarget"("grad_year", "grad_term", "target_date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTarget_staff_cycle_role_date_key" ON "ProofreadingDailyTarget" (staff_id, grad_year, grad_term, capability, target_date);

-- CreateIndex
CREATE INDEX "ProofreadingTargetChange_target_id_changed_at_idx" ON "ProofreadingTargetChange"("target_id", "changed_at");

-- CreateIndex
CREATE INDEX "ProofreadingTargetChange_changed_by_idx" ON "ProofreadingTargetChange"("changed_by");

-- CreateIndex
CREATE INDEX "ProofreadingTargetChange_operation_id_idx" ON "ProofreadingTargetChange"("operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProofreadingTargetChange_target_id_operation_id_key" ON "ProofreadingTargetChange"("target_id", "operation_id");

-- AddForeignKey
ALTER TABLE "ProofreadingDailyTarget" ADD CONSTRAINT "ProofreadingDailyTarget_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofreadingTargetChange" ADD CONSTRAINT "ProofreadingTargetChange_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "ProofreadingDailyTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofreadingTargetChange" ADD CONSTRAINT "ProofreadingTargetChange_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofreadingTargetChange" ADD CONSTRAINT "ProofreadingTargetChange_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "ReviewOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bounds are also enforced by the API. Existing graduate records are untouched.
ALTER TABLE "ProofreadingDailyTarget" ADD CONSTRAINT "ProofreadingDailyTarget_count_check" CHECK (target_count BETWEEN 0 AND 10000);
ALTER TABLE "ProofreadingDailyTarget" ADD CONSTRAINT "ProofreadingDailyTarget_version_check" CHECK (version >= 1);
ALTER TABLE "ProofreadingTargetChange" ADD CONSTRAINT "ProofreadingTargetChange_count_check" CHECK (new_count BETWEEN 0 AND 10000 AND (previous_count IS NULL OR previous_count BETWEEN 0 AND 10000));
CREATE INDEX "InformationReviewEvent_first_submission_idx" ON "InformationReviewEvent" (track_id, created_at, id) WHERE action = 'SUBMITTED_QC';

-- Keep attribution and prior values append-only, like existing review events.
CREATE FUNCTION reject_target_history_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ProofreadingTargetChange rows are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ProofreadingTargetChange_immutable"
    BEFORE UPDATE OR DELETE ON "ProofreadingTargetChange"
    FOR EACH ROW EXECUTE FUNCTION reject_target_history_change();

ALTER TABLE "ProofreadingDailyTarget" ADD CONSTRAINT "DailyTarget_role_check" CHECK (capability IN ('INFORMATION_PROOFREADER', 'INFORMATION_QC', 'PHOTO_UPLOADER', 'PHOTO_QC', 'FINAL_MODERATOR'));
CREATE INDEX "InformationReviewEvent_target_decisions_idx" ON "InformationReviewEvent" (track_id, created_at, id) WHERE action IN ('APPROVED_QC', 'REJECTED_QC', 'LOCKED', 'REJECTED_MODERATOR');
CREATE INDEX "PhotoReviewEvent_target_work_idx" ON "PhotoReviewEvent" (track_id, created_at, id) WHERE action IN ('SUBMITTED_QC', 'APPROVED_QC', 'REJECTED_QC', 'LOCKED', 'REJECTED_MODERATOR');

COMMIT;
