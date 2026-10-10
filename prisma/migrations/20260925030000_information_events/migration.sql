-- The parent revision's (id, track_id) key makes cross-graduate decisions
-- impossible even if an application bug supplies a valid foreign revision ID.
CREATE UNIQUE INDEX "ReviewRevision_id_track_id_key" ON "ReviewRevision"("id", "track_id");

CREATE TYPE "InformationEventAction" AS ENUM (
    'COMMENTED', 'SUBMITTED_QC', 'REJECTED_QC', 'APPROVED_QC',
    'SUBMITTED_MODERATOR', 'REJECTED_MODERATOR', 'LOCKED'
);

CREATE TABLE "InformationReviewEvent" (
    "id" SERIAL NOT NULL,
    "track_id" INTEGER NOT NULL,
    "track_version" INTEGER NOT NULL,
    "revision_id" INTEGER NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "operation_id" INTEGER NOT NULL,
    "action" "InformationEventAction" NOT NULL,
    "from_stage" "ReviewStage" NOT NULL,
    "to_stage" "ReviewStage" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InformationReviewEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InformationReviewEvent_track_id_track_version_key"
    ON "InformationReviewEvent"("track_id", "track_version");
CREATE UNIQUE INDEX "InformationReviewEvent_operation_id_key"
    ON "InformationReviewEvent"("operation_id");
CREATE INDEX "InformationReviewEvent_actor_id_idx" ON "InformationReviewEvent"("actor_id");

ALTER TABLE "InformationReviewEvent" ADD CONSTRAINT "InformationReviewEvent_track_id_fkey"
    FOREIGN KEY ("track_id") REFERENCES "ReviewTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InformationReviewEvent" ADD CONSTRAINT "InformationReviewEvent_revision_id_track_id_fkey"
    FOREIGN KEY ("revision_id", "track_id") REFERENCES "ReviewRevision"("id", "track_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InformationReviewEvent" ADD CONSTRAINT "InformationReviewEvent_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InformationReviewEvent" ADD CONSTRAINT "InformationReviewEvent_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "ReviewOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InformationReviewEvent" ADD CONSTRAINT "InformationReviewEvent_note_check" CHECK (
    "track_version" > 1 AND
    ("note" IS NULL OR char_length(trim("note")) BETWEEN 1 AND 2000) AND
    ("action" NOT IN ('COMMENTED', 'REJECTED_QC', 'REJECTED_MODERATOR') OR "note" IS NOT NULL)
);

ALTER TABLE "InformationReviewEvent" ADD CONSTRAINT "InformationReviewEvent_transition_check" CHECK (
    ("action" = 'COMMENTED' AND "from_stage" = "to_stage") OR
    ("action" = 'SUBMITTED_QC' AND "from_stage" IN ('DRAFT', 'REJECTED_QC', 'REJECTED_MODERATOR') AND "to_stage" = 'SUBMITTED_QC') OR
    ("action" = 'REJECTED_QC' AND "from_stage" = 'SUBMITTED_QC' AND "to_stage" = 'REJECTED_QC') OR
    ("action" = 'APPROVED_QC' AND "from_stage" = 'SUBMITTED_QC' AND "to_stage" = 'APPROVED_QC') OR
    ("action" = 'SUBMITTED_MODERATOR' AND "from_stage" = 'APPROVED_QC' AND "to_stage" = 'SUBMITTED_MODERATOR') OR
    ("action" = 'REJECTED_MODERATOR' AND "from_stage" = 'SUBMITTED_MODERATOR' AND "to_stage" = 'REJECTED_MODERATOR') OR
    ("action" = 'LOCKED' AND "from_stage" = 'SUBMITTED_MODERATOR' AND "to_stage" = 'LOCKED')
);

CREATE FUNCTION reject_information_event_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'InformationReviewEvent rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InformationReviewEvent_immutable"
    BEFORE UPDATE OR DELETE ON "InformationReviewEvent"
    FOR EACH ROW EXECUTE FUNCTION reject_information_event_change();
