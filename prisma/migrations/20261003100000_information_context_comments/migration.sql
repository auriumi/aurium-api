-- A comment can precede the first information draft. Approval and rejection
-- events still require the exact immutable revision being reviewed.
ALTER TABLE "InformationReviewEvent" ALTER COLUMN "revision_id" DROP NOT NULL;
ALTER TABLE "InformationReviewEvent" ADD CONSTRAINT "InformationReviewEvent_revision_context_check" CHECK (
    "revision_id" IS NOT NULL OR
    ("action" = 'COMMENTED' AND "from_stage" = 'DRAFT' AND "to_stage" = 'DRAFT')
);

-- Existing foreign keys, transition checks and append-only triggers remain.
-- Commenting on a completed review does not unlock it or change its snapshot.
