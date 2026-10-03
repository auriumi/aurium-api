# Information review comments

`POST /api/admin/information-reviews/:reviewId/comments` accepts:

```json
{
  "expectedVersion": 4,
  "revisionId": 8,
  "operationId": "54e3cc16-24ac-4b0a-8ed0-cfe580551ca7",
  "note": "Please check the spelling."
}
```

An active, scoped information proofreader, QC reviewer, or moderator may comment throughout the review workflow, including Pending and Completed. Use the latest saved revision ID, or `revisionId: null` only when an initial draft has no saved revision yet. A comment on Completed leaves the approved information locked. The note must be trimmed and 1–2000 characters. A successful response contains `eventId`, `revisionId`, `version`, and unchanged `stage`. The comment is appended to `InformationReviewEvent` with actor and timestamp; it never changes the saved draft or live graduate fields.

The expected version and exact revision make a stale comment return `409`. Each comment increments the track version, so a concurrent QC/moderator decision must refresh. Reusing the same `operationId` and payload returns the prior response; using the ID for different text returns `409`.

The additive `20261003100000_information_context_comments` migration permits a null revision only for an initial-draft comment. Other review events still require their exact revision. Existing events, foreign keys, transition checks and append-only protections remain. It requires no backfill or graduate record rewrite. Migration and workflow exercises belong in the isolated fictional-data environment; no live migration is part of this work. Before release, validate concurrent comments/decisions, completed-review correction requests and the reviewed migration/restore procedure on representative PostgreSQL.
