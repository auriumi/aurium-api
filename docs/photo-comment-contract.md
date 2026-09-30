# Photo review comments

`POST /api/admin/photo-reviews/:reviewId/comments` accepts the current `expectedVersion`, exact `pairRevisionId`, UUID `operationId`, and a trimmed 1–2000 character `note`. Only an assigned photo QC reviewer may comment while the pair is submitted to or approved by QC. Only the designated final moderator may comment after forwarding. Draft, returned, and locked stages remain read-only for comments; this keeps an editable pair's submission version tied to its last upload.

The server rechecks assignment, stage, version, and latest pair under the track row lock. It appends a `COMMENTED` photo event and increments the track version without changing the pair or its stage. Reusing the same operation ID and payload returns the previous result; changing the payload returns `409`. The bounded decision-events endpoint already exposes comments to assigned photo staff.

Two additive migrations are ordered deliberately: first commit the new enum value, then extend the transition constraint. Existing events, assets, and graduate records are retained. Apply and exercise them only after the schema baseline and backup/restore procedure have been verified in an isolated PostgreSQL environment. QC/moderator decisions after a comment must refresh to use the new version.
