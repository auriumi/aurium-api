CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "CorrectionRequest" (
    "id" SERIAL NOT NULL,
    "track_id" INTEGER NOT NULL,
    "locked_version" INTEGER NOT NULL,
    "information_revision_id" INTEGER,
    "photo_pair_id" INTEGER,
    "requested_by" INTEGER NOT NULL,
    "request_operation_id" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by" INTEGER,
    "decision_operation_id" INTEGER,
    "decision_note" TEXT,
    "decided_at" TIMESTAMP(3),
    "reopened_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CorrectionRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CorrectionRequest_shape_check" CHECK (
        "locked_version" > 0 AND
        (("information_revision_id" IS NOT NULL AND "photo_pair_id" IS NULL) OR
         ("information_revision_id" IS NULL AND "photo_pair_id" IS NOT NULL)) AND
        char_length(trim("reason")) BETWEEN 1 AND 2000 AND
        ("decision_note" IS NULL OR char_length(trim("decision_note")) BETWEEN 1 AND 2000) AND
        (("status" = 'PENDING' AND "decided_by" IS NULL AND "decision_operation_id" IS NULL
          AND "decided_at" IS NULL AND "decision_note" IS NULL AND "reopened_version" IS NULL) OR
         ("status" = 'REJECTED' AND "decided_by" IS NOT NULL AND "decision_operation_id" IS NOT NULL
          AND "decided_at" IS NOT NULL AND "decision_note" IS NOT NULL AND "reopened_version" IS NULL) OR
         ("status" = 'APPROVED' AND "decided_by" IS NOT NULL AND "decision_operation_id" IS NOT NULL
          AND "decided_at" IS NOT NULL AND "decision_note" IS NULL AND "reopened_version" > "locked_version"))
    )
);

CREATE UNIQUE INDEX "CorrectionRequest_request_operation_id_key" ON "CorrectionRequest"("request_operation_id");
CREATE UNIQUE INDEX "CorrectionRequest_decision_operation_id_key" ON "CorrectionRequest"("decision_operation_id");
CREATE UNIQUE INDEX "CorrectionRequest_one_pending_per_track" ON "CorrectionRequest"("track_id") WHERE "status" = 'PENDING';
CREATE INDEX "CorrectionRequest_track_id_created_at_idx" ON "CorrectionRequest"("track_id", "created_at");
CREATE INDEX "CorrectionRequest_status_created_at_idx" ON "CorrectionRequest"("status", "created_at");
CREATE INDEX "CorrectionRequest_information_revision_id_idx" ON "CorrectionRequest"("information_revision_id");
CREATE INDEX "CorrectionRequest_photo_pair_id_idx" ON "CorrectionRequest"("photo_pair_id");
CREATE INDEX "CorrectionRequest_requested_by_idx" ON "CorrectionRequest"("requested_by");
CREATE INDEX "CorrectionRequest_decided_by_idx" ON "CorrectionRequest"("decided_by");

ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_track_id_fkey"
    FOREIGN KEY ("track_id") REFERENCES "ReviewTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_information_revision_id_track_id_fkey"
    FOREIGN KEY ("information_revision_id", "track_id") REFERENCES "ReviewRevision"("id", "track_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_photo_pair_id_track_id_fkey"
    FOREIGN KEY ("photo_pair_id", "track_id") REFERENCES "PhotoPairRevision"("id", "track_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_requested_by_fkey"
    FOREIGN KEY ("requested_by") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_decided_by_fkey"
    FOREIGN KEY ("decided_by") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_request_operation_id_fkey"
    FOREIGN KEY ("request_operation_id") REFERENCES "ReviewOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CorrectionRequest" ADD CONSTRAINT "CorrectionRequest_decision_operation_id_fkey"
    FOREIGN KEY ("decision_operation_id") REFERENCES "ReviewOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION guard_correction_request() RETURNS trigger AS $$
DECLARE track_type "ReviewTrackType";
DECLARE track_stage "ReviewStage";
DECLARE track_version INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'CorrectionRequest history cannot be deleted';
    END IF;
    IF TG_OP = 'INSERT' THEN
        SELECT type, stage, version INTO track_type, track_stage, track_version
        FROM "ReviewTrack" WHERE id = NEW.track_id;
        IF track_stage <> 'LOCKED' OR track_version <> NEW.locked_version OR
           (track_type = 'INFORMATION' AND NEW.information_revision_id IS NULL) OR
           (track_type = 'PHOTOS' AND NEW.photo_pair_id IS NULL) THEN
            RAISE EXCEPTION 'Correction request must reference a current locked revision';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.status <> 'PENDING' OR NEW.status = 'PENDING' OR
       (OLD.id, OLD.track_id, OLD.locked_version, OLD.information_revision_id,
        OLD.photo_pair_id, OLD.requested_by, OLD.request_operation_id,
        OLD.reason, OLD.created_at) IS DISTINCT FROM
       (NEW.id, NEW.track_id, NEW.locked_version, NEW.information_revision_id,
        NEW.photo_pair_id, NEW.requested_by, NEW.request_operation_id,
        NEW.reason, NEW.created_at) THEN
        RAISE EXCEPTION 'CorrectionRequest history is immutable after a decision';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CorrectionRequest_guard" BEFORE INSERT OR UPDATE OR DELETE ON "CorrectionRequest"
    FOR EACH ROW EXECUTE FUNCTION guard_correction_request();

ALTER TABLE "InformationReviewEvent" DROP CONSTRAINT "InformationReviewEvent_transition_check";
ALTER TABLE "InformationReviewEvent" ADD CONSTRAINT "InformationReviewEvent_transition_check" CHECK (
    ("action" = 'COMMENTED' AND "from_stage" = "to_stage") OR
    ("action" = 'SUBMITTED_QC' AND "from_stage" IN ('DRAFT', 'REJECTED_QC', 'REJECTED_MODERATOR') AND "to_stage" = 'SUBMITTED_QC') OR
    ("action" = 'REJECTED_QC' AND "from_stage" = 'SUBMITTED_QC' AND "to_stage" = 'REJECTED_QC') OR
    ("action" = 'APPROVED_QC' AND "from_stage" = 'SUBMITTED_QC' AND "to_stage" = 'APPROVED_QC') OR
    ("action" = 'SUBMITTED_MODERATOR' AND "from_stage" = 'APPROVED_QC' AND "to_stage" = 'SUBMITTED_MODERATOR') OR
    ("action" = 'REJECTED_MODERATOR' AND "from_stage" = 'SUBMITTED_MODERATOR' AND "to_stage" = 'REJECTED_MODERATOR') OR
    ("action" = 'LOCKED' AND "from_stage" = 'SUBMITTED_MODERATOR' AND "to_stage" = 'LOCKED') OR
    ("action" = 'REOPENED' AND "from_stage" = 'LOCKED' AND "to_stage" = 'DRAFT')
);
ALTER TABLE "PhotoReviewEvent" DROP CONSTRAINT "PhotoReviewEvent_transition_check";
ALTER TABLE "PhotoReviewEvent" ADD CONSTRAINT "PhotoReviewEvent_transition_check" CHECK (
    ("action" = 'COMMENTED' AND "from_stage" IN ('SUBMITTED_QC', 'APPROVED_QC', 'SUBMITTED_MODERATOR')
        AND "to_stage" = "from_stage" AND "note" IS NOT NULL) OR
    ("action" = 'SUBMITTED_QC' AND "from_stage" IN ('DRAFT', 'REJECTED_QC', 'REJECTED_MODERATOR') AND "to_stage" = 'SUBMITTED_QC') OR
    ("action" = 'REJECTED_QC' AND "from_stage" = 'SUBMITTED_QC' AND "to_stage" = 'REJECTED_QC' AND "note" IS NOT NULL) OR
    ("action" = 'APPROVED_QC' AND "from_stage" = 'SUBMITTED_QC' AND "to_stage" = 'APPROVED_QC') OR
    ("action" = 'SUBMITTED_MODERATOR' AND "from_stage" = 'APPROVED_QC' AND "to_stage" = 'SUBMITTED_MODERATOR') OR
    ("action" = 'REJECTED_MODERATOR' AND "from_stage" = 'SUBMITTED_MODERATOR' AND "to_stage" = 'REJECTED_MODERATOR' AND "note" IS NOT NULL) OR
    ("action" = 'LOCKED' AND "from_stage" = 'SUBMITTED_MODERATOR' AND "to_stage" = 'LOCKED') OR
    ("action" = 'REOPENED' AND "from_stage" = 'LOCKED' AND "to_stage" = 'DRAFT')
);
