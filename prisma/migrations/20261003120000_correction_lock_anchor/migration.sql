BEGIN;

-- Comments advance the track version without changing the approved revision.
-- Anchor a request to the latest lock event, not to the latest comment version.
CREATE OR REPLACE FUNCTION guard_correction_request() RETURNS trigger AS $$
DECLARE
    track_type "ReviewTrackType";
    track_stage "ReviewStage";
    track_version INTEGER;
    approved_version INTEGER;
    approved_revision INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'CorrectionRequest history cannot be deleted';
    END IF;
    IF TG_OP = 'INSERT' THEN
        SELECT t.type, t.stage, t.version INTO track_type, track_stage, track_version
        FROM "ReviewTrack" t WHERE t.id = NEW.track_id FOR UPDATE;
        IF NOT FOUND OR track_stage IS DISTINCT FROM 'LOCKED' OR
           track_version < NEW.locked_version THEN
            RAISE EXCEPTION 'Correction request must reference a current locked revision';
        END IF;

        IF track_type = 'INFORMATION' THEN
            SELECT e.track_version, e.revision_id INTO approved_version, approved_revision
            FROM "InformationReviewEvent" e
            WHERE e.track_id = NEW.track_id AND e.action = 'LOCKED'
            ORDER BY e.track_version DESC LIMIT 1;
            IF approved_revision IS NULL OR NEW.photo_pair_id IS NOT NULL OR
               approved_revision IS DISTINCT FROM NEW.information_revision_id THEN
                RAISE EXCEPTION 'Correction request must reference the latest locked information revision';
            END IF;
        ELSIF track_type = 'PHOTOS' THEN
            SELECT e.track_version, e.pair_id INTO approved_version, approved_revision
            FROM "PhotoReviewEvent" e
            WHERE e.track_id = NEW.track_id AND e.action = 'LOCKED'
            ORDER BY e.track_version DESC LIMIT 1;
            IF approved_revision IS NULL OR NEW.information_revision_id IS NOT NULL OR
               approved_revision IS DISTINCT FROM NEW.photo_pair_id THEN
                RAISE EXCEPTION 'Correction request must reference the latest locked photo pair';
            END IF;
        ELSE
            RAISE EXCEPTION 'Correction request requires an information or photo review';
        END IF;

        IF approved_version IS DISTINCT FROM NEW.locked_version THEN
            RAISE EXCEPTION 'Correction request must reference the latest lock event';
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

COMMIT;
