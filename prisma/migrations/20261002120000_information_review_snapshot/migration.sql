-- A reviewed profile may already be correct. Preserve its unchanged snapshot
-- for QC and moderator approval, without inventing an edit to Student data.
-- Existing revisions and their append-only protection are unchanged.
ALTER TABLE "ReviewRevision" DROP CONSTRAINT "ReviewRevision_snapshot_check";
ALTER TABLE "ReviewRevision" ADD CONSTRAINT "ReviewRevision_snapshot_check" CHECK (
    "track_version" > 1 AND
    jsonb_typeof("before_snapshot") = 'object' AND
    jsonb_typeof("after_snapshot") = 'object' AND
    "canonical_hash" ~ '^[0-9a-f]{64}$'
);
