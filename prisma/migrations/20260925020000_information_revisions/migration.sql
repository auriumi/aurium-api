-- A review revision records an editable-profile transition without writing to
-- Student or StudentDetail. No backfill or live-row rewrite is required.
CREATE TABLE "ReviewRevision" (
    "id" SERIAL NOT NULL,
    "track_id" INTEGER NOT NULL,
    "track_version" INTEGER NOT NULL,
    "before_snapshot" JSONB NOT NULL,
    "after_snapshot" JSONB NOT NULL,
    "canonical_hash" VARCHAR(64) NOT NULL,
    "created_by" INTEGER NOT NULL,
    "operation_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewRevision_track_id_track_version_key" ON "ReviewRevision"("track_id", "track_version");
CREATE UNIQUE INDEX "ReviewRevision_operation_id_key" ON "ReviewRevision"("operation_id");
CREATE INDEX "ReviewRevision_created_by_idx" ON "ReviewRevision"("created_by");

ALTER TABLE "ReviewRevision" ADD CONSTRAINT "ReviewRevision_track_id_fkey"
    FOREIGN KEY ("track_id") REFERENCES "ReviewTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewRevision" ADD CONSTRAINT "ReviewRevision_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewRevision" ADD CONSTRAINT "ReviewRevision_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "ReviewOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReviewRevision" ADD CONSTRAINT "ReviewRevision_snapshot_check" CHECK (
    "track_version" > 1 AND
    jsonb_typeof("before_snapshot") = 'object' AND
    jsonb_typeof("after_snapshot") = 'object' AND
    "before_snapshot" <> "after_snapshot" AND
    "canonical_hash" ~ '^[0-9a-f]{64}$'
);

-- Audit entries must never be silently rewritten or removed, including by a
-- direct database client. A correction is a new revision.
CREATE FUNCTION reject_review_revision_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ReviewRevision rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReviewRevision_immutable"
    BEFORE UPDATE OR DELETE ON "ReviewRevision"
    FOR EACH ROW EXECUTE FUNCTION reject_review_revision_change();
