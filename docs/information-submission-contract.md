# Information submission to QC

`POST /api/admin/information-reviews/:reviewId/submission` accepts `expectedVersion`, `revisionId` and a UUID `operationId`. The caller must have a current information-proofreader assignment covering the RAC-verified graduate.

For an initial Pending review with no saved revision, send `revisionId: null`. The service validates the required profile fields and creates one immutable snapshot of the displayed information before submitting it to QC. A correct profile does not require an invented edit. For a saved draft, send its exact latest revision ID.

A QC or moderator rejection returns the record to the proofreader. After rechecking, the proofreader may save corrections or resubmit the existing revision if its values are already correct. Both paths go through QC again; there is no direct resubmission to the moderator. The separate IT-correction feature still requires a maker change after an authorized reopening.

Submission rechecks the assignment, stage, expected version, revision and live-profile baseline inside the transaction. Stale versions/revisions or changed live values return a conflict. Retrying the same operation ID and payload returns the stored result without duplicate snapshots or events; a different payload with that ID is rejected. The transition appends an immutable event and makes the record read-only while under review. Student and StudentDetail fields are not published here; final moderator approval handles publication.

The additive `20261002120000_information_review_snapshot` migration permits the unchanged snapshot while retaining existing revisions. Migration and workflow exercises use the isolated fictional-data environment; no live migration is part of this work. Final release checks include concurrent submissions, scope isolation, stale baselines, recheck returns, IT-reopening guards and the reviewed migration/restore procedure on representative PostgreSQL.
