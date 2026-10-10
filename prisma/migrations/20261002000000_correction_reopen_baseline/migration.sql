-- An IT-approved reopening starts from the exact locked profile. It is a
-- marked baseline revision; a proofreader still has to make a real change.
ALTER TABLE "ReviewRevision"
    ADD COLUMN "is_reopen_baseline" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ReviewRevision" DROP CONSTRAINT "ReviewRevision_snapshot_check";
ALTER TABLE "ReviewRevision" ADD CONSTRAINT "ReviewRevision_snapshot_check" CHECK (
    "track_version" > 1 AND
    jsonb_typeof("before_snapshot") = 'object' AND
    jsonb_typeof("after_snapshot") = 'object' AND
    (("is_reopen_baseline" AND "before_snapshot" = "after_snapshot") OR
     (NOT "is_reopen_baseline" AND "before_snapshot" <> "after_snapshot")) AND
    "canonical_hash" ~ '^[0-9a-f]{64}$'
);
