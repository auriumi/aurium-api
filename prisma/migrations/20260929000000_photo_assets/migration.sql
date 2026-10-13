-- CreateEnum
CREATE TYPE "PhotoUploadStatus" AS ENUM ('STAGED', 'SEALED');
CREATE TYPE "PhotoEventAction" AS ENUM ('SUBMITTED_QC', 'REJECTED_QC', 'APPROVED_QC', 'SUBMITTED_MODERATOR', 'REJECTED_MODERATOR', 'LOCKED');

-- CreateTable
CREATE TABLE "PhotoAsset" (
    "id" SERIAL NOT NULL,
    "track_id" INTEGER NOT NULL,
    "type" "ImageType" NOT NULL,
    "status" "PhotoUploadStatus" NOT NULL DEFAULT 'STAGED',
    "staging_key" TEXT NOT NULL,
    "final_key" TEXT,
    "mime_type" VARCHAR(20) NOT NULL,
    "byte_size" INTEGER,
    "sha256" VARCHAR(64),
    "uploaded_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sealed_at" TIMESTAMP(3),

    CONSTRAINT "PhotoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoPairRevision" (
    "id" SERIAL NOT NULL,
    "track_id" INTEGER NOT NULL,
    "track_version" INTEGER NOT NULL,
    "graduation_asset_id" INTEGER NOT NULL,
    "theme_asset_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoPairRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhotoReviewEvent" (
    "id" SERIAL NOT NULL,
    "track_id" INTEGER NOT NULL,
    "track_version" INTEGER NOT NULL,
    "pair_id" INTEGER NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "operation_id" INTEGER NOT NULL,
    "action" "PhotoEventAction" NOT NULL,
    "from_stage" "ReviewStage" NOT NULL,
    "to_stage" "ReviewStage" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhotoReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhotoAsset_staging_key_key" ON "PhotoAsset"("staging_key");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoAsset_final_key_key" ON "PhotoAsset"("final_key");

-- CreateIndex
CREATE INDEX "PhotoAsset_track_id_type_status_sealed_at_idx" ON "PhotoAsset"("track_id", "type", "status", "sealed_at");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoAsset_id_track_id_key" ON "PhotoAsset"("id", "track_id");

-- CreateIndex
CREATE INDEX "PhotoPairRevision_created_by_idx" ON "PhotoPairRevision"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoPairRevision_track_id_track_version_key" ON "PhotoPairRevision"("track_id", "track_version");
CREATE UNIQUE INDEX "PhotoPairRevision_id_track_id_key" ON "PhotoPairRevision"("id", "track_id");
CREATE UNIQUE INDEX "PhotoReviewEvent_operation_id_key" ON "PhotoReviewEvent"("operation_id");
CREATE UNIQUE INDEX "PhotoReviewEvent_track_id_track_version_key" ON "PhotoReviewEvent"("track_id", "track_version");
CREATE INDEX "PhotoReviewEvent_actor_id_idx" ON "PhotoReviewEvent"("actor_id");

-- AddForeignKey
ALTER TABLE "PhotoAsset" ADD CONSTRAINT "PhotoAsset_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "ReviewTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoAsset" ADD CONSTRAINT "PhotoAsset_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoPairRevision" ADD CONSTRAINT "PhotoPairRevision_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "ReviewTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoPairRevision" ADD CONSTRAINT "PhotoPairRevision_graduation_asset_id_track_id_fkey" FOREIGN KEY ("graduation_asset_id", "track_id") REFERENCES "PhotoAsset"("id", "track_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoPairRevision" ADD CONSTRAINT "PhotoPairRevision_theme_asset_id_track_id_fkey" FOREIGN KEY ("theme_asset_id", "track_id") REFERENCES "PhotoAsset"("id", "track_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoPairRevision" ADD CONSTRAINT "PhotoPairRevision_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhotoReviewEvent" ADD CONSTRAINT "PhotoReviewEvent_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "ReviewTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhotoReviewEvent" ADD CONSTRAINT "PhotoReviewEvent_pair_id_track_id_fkey" FOREIGN KEY ("pair_id", "track_id") REFERENCES "PhotoPairRevision"("id", "track_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhotoReviewEvent" ADD CONSTRAINT "PhotoReviewEvent_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhotoReviewEvent" ADD CONSTRAINT "PhotoReviewEvent_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "ReviewOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PhotoAsset" ADD CONSTRAINT "PhotoAsset_seal_check" CHECK (
    ("status" = 'STAGED' AND "final_key" IS NULL AND "byte_size" IS NULL AND "sha256" IS NULL AND "sealed_at" IS NULL) OR
    ("status" = 'SEALED' AND "final_key" IS NOT NULL AND "byte_size" BETWEEN 64 AND 8388608 AND
     "sha256" ~ '^[0-9a-f]{64}$' AND "sealed_at" IS NOT NULL)
);

CREATE FUNCTION guard_photo_asset() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' OR OLD.status = 'SEALED' THEN
        RAISE EXCEPTION 'PhotoAsset history is immutable';
    END IF;
    IF NEW.status <> 'SEALED' OR NEW.id <> OLD.id OR NEW.track_id <> OLD.track_id OR
       NEW.type <> OLD.type OR NEW.staging_key <> OLD.staging_key OR
       NEW.mime_type <> OLD.mime_type OR NEW.uploaded_by <> OLD.uploaded_by OR
       NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'PhotoAsset can only be sealed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PhotoAsset_guard" BEFORE UPDATE OR DELETE ON "PhotoAsset"
    FOR EACH ROW EXECUTE FUNCTION guard_photo_asset();

CREATE FUNCTION guard_photo_asset_insert() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "ReviewTrack" t JOIN "ReviewCase" c ON c.id = t.case_id
        JOIN "Student" s ON s.id = c.student_id WHERE t.id = NEW.track_id
        AND t.type = 'PHOTOS' AND c.outcome = 'VERIFIED'
        AND c.grad_year = s.grad_year AND c.grad_term = s.grad_term) THEN
        RAISE EXCEPTION 'PhotoAsset requires a verified photo review track';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PhotoAsset_insert_guard" BEFORE INSERT ON "PhotoAsset"
    FOR EACH ROW EXECUTE FUNCTION guard_photo_asset_insert();

CREATE FUNCTION guard_photo_pair() RETURNS trigger AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'PhotoPairRevision history is immutable';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "PhotoAsset" WHERE id = NEW.graduation_asset_id AND
       track_id = NEW.track_id AND type = 'GRADUATION' AND status = 'SEALED') OR
       NOT EXISTS (SELECT 1 FROM "PhotoAsset" WHERE id = NEW.theme_asset_id AND
       track_id = NEW.track_id AND type = 'THEME' AND status = 'SEALED') THEN
        RAISE EXCEPTION 'Photo pair must contain sealed graduation and theme assets from one track';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PhotoPairRevision_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PhotoPairRevision"
    FOR EACH ROW EXECUTE FUNCTION guard_photo_pair();

CREATE FUNCTION guard_photo_event() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'PhotoReviewEvent history is immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PhotoReviewEvent_guard" BEFORE UPDATE OR DELETE ON "PhotoReviewEvent"
    FOR EACH ROW EXECUTE FUNCTION guard_photo_event();
ALTER TABLE "PhotoReviewEvent" ADD CONSTRAINT "PhotoReviewEvent_transition_check" CHECK (
    ("action" = 'SUBMITTED_QC' AND "from_stage" IN ('DRAFT', 'REJECTED_QC', 'REJECTED_MODERATOR') AND "to_stage" = 'SUBMITTED_QC') OR
    ("action" = 'REJECTED_QC' AND "from_stage" = 'SUBMITTED_QC' AND "to_stage" = 'REJECTED_QC' AND "note" IS NOT NULL) OR
    ("action" = 'APPROVED_QC' AND "from_stage" = 'SUBMITTED_QC' AND "to_stage" = 'APPROVED_QC') OR
    ("action" = 'SUBMITTED_MODERATOR' AND "from_stage" = 'APPROVED_QC' AND "to_stage" = 'SUBMITTED_MODERATOR') OR
    ("action" = 'REJECTED_MODERATOR' AND "from_stage" = 'SUBMITTED_MODERATOR' AND "to_stage" = 'REJECTED_MODERATOR' AND "note" IS NOT NULL) OR
    ("action" = 'LOCKED' AND "from_stage" = 'SUBMITTED_MODERATOR' AND "to_stage" = 'LOCKED')
);
ALTER TABLE "PhotoReviewEvent" ADD CONSTRAINT "PhotoReviewEvent_note_check" CHECK (
    "note" IS NULL OR char_length(trim("note")) BETWEEN 1 AND 2000
);

-- Keep the year-only legacy table from changing RAC-verified records, even if
-- an old route or a concurrent verification slips past an application check.
CREATE FUNCTION guard_review_managed_legacy_image() RETURNS trigger AS $$
DECLARE
    target_number INTEGER;
    target_year INTEGER;
BEGIN
    target_number := CASE WHEN TG_OP = 'DELETE' THEN OLD.student_number ELSE NEW.student_number END;
    target_year := CASE WHEN TG_OP = 'DELETE' THEN OLD.year ELSE NEW.year END;
    IF EXISTS (SELECT 1 FROM "ReviewCase" c JOIN "Student" s ON s.id = c.student_id
        WHERE s.student_number = target_number AND c.grad_year = target_year AND c.outcome = 'VERIFIED') OR
       (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM "ReviewCase" c JOIN "Student" s ON s.id = c.student_id
        WHERE s.student_number = OLD.student_number AND c.grad_year = OLD.year AND c.outcome = 'VERIFIED')) THEN
        RAISE EXCEPTION 'Use PhotoAsset for RAC-verified graduates';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StudentImage_review_guard" BEFORE INSERT OR UPDATE OR DELETE ON "StudentImage"
    FOR EACH ROW EXECUTE FUNCTION guard_review_managed_legacy_image();
