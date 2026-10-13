BEGIN;

-- Preserve existing history. Only comments before the first pair may omit it.
ALTER TABLE "PhotoReviewEvent" ALTER COLUMN "pair_id" DROP NOT NULL;
ALTER TABLE "PhotoReviewEvent" ADD CONSTRAINT "PhotoReviewEvent_pair_required_check"
  CHECK ("pair_id" IS NOT NULL OR ("action" = 'COMMENTED' AND "from_stage" = 'DRAFT'));

ALTER TABLE "PhotoReviewEvent" DROP CONSTRAINT "PhotoReviewEvent_transition_check";
ALTER TABLE "PhotoReviewEvent" ADD CONSTRAINT "PhotoReviewEvent_transition_check" CHECK (
  ("action" = 'COMMENTED' AND "from_stage" = "to_stage" AND "note" IS NOT NULL) OR
  ("action" = 'SUBMITTED_QC' AND "from_stage" IN ('DRAFT', 'REJECTED_QC', 'REJECTED_MODERATOR') AND "to_stage" = 'SUBMITTED_QC') OR
  ("action" = 'REJECTED_QC' AND "from_stage" = 'SUBMITTED_QC' AND "to_stage" = 'REJECTED_QC' AND "note" IS NOT NULL) OR
  ("action" = 'APPROVED_QC' AND "from_stage" = 'SUBMITTED_QC' AND "to_stage" = 'APPROVED_QC') OR
  ("action" = 'SUBMITTED_MODERATOR' AND "from_stage" = 'APPROVED_QC' AND "to_stage" = 'SUBMITTED_MODERATOR') OR
  ("action" = 'REJECTED_MODERATOR' AND "from_stage" = 'SUBMITTED_MODERATOR' AND "to_stage" = 'REJECTED_MODERATOR' AND "note" IS NOT NULL) OR
  ("action" = 'LOCKED' AND "from_stage" = 'SUBMITTED_MODERATOR' AND "to_stage" = 'LOCKED') OR
  -- The later IT feature adds this enum value; its transition remains valid.
  ("action"::text = 'REOPENED' AND "from_stage" = 'LOCKED' AND "to_stage" = 'DRAFT')
);

COMMIT;
