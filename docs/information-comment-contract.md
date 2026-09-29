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

An active, scoped information proofreader, QC reviewer, or moderator may comment on the latest saved revision while the review is not locked. The note must be trimmed and 1–2000 characters. A successful response contains `eventId`, `revisionId`, `version`, and unchanged `stage`. The comment is appended to `InformationReviewEvent` with actor and timestamp; it never changes the saved draft or live graduate fields.

The expected version and exact revision make a stale comment return `409`. Each comment increments the track version, so a concurrent QC/moderator decision must refresh. Reusing the same `operationId` and payload returns the prior response; using the ID for different text returns `409`.

This uses the existing additive information-review tables. No new migration, backfill, or graduate record rewrite is required. Verify comments and a simultaneous decision with isolated staff accounts before pilot.
