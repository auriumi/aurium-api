# Photo upload foundation (P13)

The photo track is separate from information review. Only a currently assigned `PHOTO_UPLOADER` in the graduate's scope can create or finalize an upload. RAC/SAO verification and the graduate's graduation year and term must still match. The registration photo is read-only.

`POST /api/admin/photo-reviews/:reviewId/uploads` accepts `{ "type": "GRADUATION", "mime": "image/jpeg", "expectedVersion": 1 }` and returns an `assetId` and a 120-second signed PUT URL. PNG and WebP are also accepted. The browser sends the file directly to that staging URL with the matching `Content-Type`, then calls `POST /api/admin/photo-reviews/:reviewId/uploads/:assetId/finalize` with `{ "expectedVersion": 1 }`.

Finalization reads at most 5 MB, checks the declared MIME and file signature, and fully decodes the image with Sharp before sealing it. Only still JPEG, PNG and WebP files are accepted, up to 8192 pixels per side and 32 million pixels, with a 10-second decoder processing limit. Invalid images cannot be sealed or attached to a pair. The server hashes and stores the original bytes; it does not resize or strip metadata. Decoder memory is bounded by the pixel limit; include concurrent upload finalization in staging load tests.

The browser never receives a write URL for a final object. A successful response increments the track version. When both photo types exist, it also returns a new immutable `pairRevisionId`. If one type is missing, no pair revision exists. A replacement creates a new pair revision; earlier assets and revisions remain available for audit.

For this release, staff view final approved pairs in Photo Workspace only. No export or legacy `StudentImage` publication adapter is included. During IT reopening the workspace shows the correction stage, and the replacement pair must pass QC and moderator approval before being shown as Completed.

`GET /api/admin/photo-reviews` accepts `year`, `term`, `page`, `stage`, search and academic filters, and returns up to 25 rows sorted by first name. `GET /api/admin/photo-reviews/filter-options` returns scoped academic choices. `GET /api/admin/photo-reviews/:reviewId` returns the current pair, both signed read URLs, the read-only registration reference, and the graduate profile. These read URLs expire after 15 minutes.

`POST /api/admin/photo-reviews/:reviewId/submission` accepts `{ "expectedVersion": 3, "revisionId": 10, "operationId": "<UUID>" }`. It requires the latest complete pair at the current version and moves a draft to `SUBMITTED_QC`. The request ID makes retries deterministic. QC and moderator decisions are separate follow-up changes.

The migration adds tables and constraints. It does not rewrite, drop or backfill graduate records. Legacy `StudentImage` writes are blocked for RAC-verified graduates of the same year because that table is mutable and does not distinguish graduation terms. Legacy reads remain. Uploaded staging objects and any final object written before a failed database transaction may remain unlinked; cleanup needs a separate age-based job that never deletes linked or historical final objects.

Before applying this migration, confirm the deployed schema baseline, database backup and restore procedure, R2 credentials and CORS for signed PUT, and isolated staff/graduate test accounts. Verify a full upload and browser refresh on an isolated database. No database migration or R2 upload was run in this local review checkout.
