BEGIN;
ALTER TABLE "PhotoReviewEvent" DROP CONSTRAINT "PhotoReviewEvent_transition_check";
ALTER TABLE "PhotoReviewEvent" ADD CONSTRAINT "PhotoReviewEvent_transition_check" CHECK (
    ("action" = 'COMMENTED' AND "from_stage" IN ('SUBMITTED_QC', 'APPROVED_QC', 'SUBMITTED_MODERATOR')
        AND "to_stage" = "from_stage" AND "note" IS NOT NULL) OR
    ("action" = 'SUBMITTED_QC' AND "from_stage" IN ('DRAFT', 'REJECTED_QC', 'REJECTED_MODERATOR') AND "to_stage" = 'SUBMITTED_QC') OR
    ("action" = 'REJECTED_QC' AND "from_stage" = 'SUBMITTED_QC' AND "to_stage" = 'REJECTED_QC' AND "note" IS NOT NULL) OR
    ("action" = 'APPROVED_QC' AND "from_stage" = 'SUBMITTED_QC' AND "to_stage" = 'APPROVED_QC') OR
    ("action" = 'SUBMITTED_MODERATOR' AND "from_stage" = 'APPROVED_QC' AND "to_stage" = 'SUBMITTED_MODERATOR') OR
    ("action" = 'REJECTED_MODERATOR' AND "from_stage" = 'SUBMITTED_MODERATOR' AND "to_stage" = 'REJECTED_MODERATOR' AND "note" IS NOT NULL) OR
    ("action" = 'LOCKED' AND "from_stage" = 'SUBMITTED_MODERATOR' AND "to_stage" = 'LOCKED')
);
COMMIT;
