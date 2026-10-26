-- Preserve the initial local proofreader targets while extending to each workflow role.
ALTER TABLE "ProofreadingDailyTarget" ADD COLUMN "capability" "ReviewCapability" NOT NULL DEFAULT 'INFORMATION_PROOFREADER';
DROP INDEX "ProofreadingDailyTarget_staff_id_grad_year_grad_term_target_key";
CREATE UNIQUE INDEX "DailyTarget_staff_cycle_role_date_key" ON "ProofreadingDailyTarget" (staff_id, grad_year, grad_term, capability, target_date);
ALTER TABLE "ProofreadingDailyTarget" ADD CONSTRAINT "DailyTarget_role_check" CHECK (capability IN ('INFORMATION_PROOFREADER', 'INFORMATION_QC', 'PHOTO_UPLOADER', 'PHOTO_QC', 'FINAL_MODERATOR'));
CREATE INDEX "InformationReviewEvent_target_decisions_idx" ON "InformationReviewEvent" (track_id, created_at, id) WHERE action IN ('APPROVED_QC', 'REJECTED_QC', 'LOCKED', 'REJECTED_MODERATOR');
CREATE INDEX "PhotoReviewEvent_target_work_idx" ON "PhotoReviewEvent" (track_id, created_at, id) WHERE action IN ('SUBMITTED_QC', 'APPROVED_QC', 'REJECTED_QC', 'LOCKED', 'REJECTED_MODERATOR');
