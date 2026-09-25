# RAC/SAO verification API

This PR records the first manual check against the official RAC/SAO graduate list. It does not parse Excel/CSV or perform automatic name matching. Configure `RAC_SOURCE_VERSION` to the official list's agreed version label before enabling writes. The server records that label on every case and history event; the browser does not ask staff to type reference notes.

An authenticated staff member needs an active `RAC_CHECK` assignment covering the graduate's department, course and major. Existing admin/moderator roles alone are insufficient. All read and mutation paths check that scope. A case is unique by existing Student ID, graduation year and term; no case means Not checked. A Not on list case may later become Verified. A Verified case cannot be checked again by this endpoint. Successful confirmation creates independent information and photo draft tracks in the same transaction.

## Resources

- `GET /api/admin/review-graduates?year=2026&term=END_YEAR&verification=UNCHECKED&page=1&department=...&program=...&major=...&search=...` returns at most 25 authorized rows, selected-status total, current official `sourceVersion`, and counts across the same academic/search scope. Search matches name parts or a complete student number. Status can be `ALL`, `UNCHECKED`, `NOT_LISTED`, or `VERIFIED`. The API sorts by the stored first-name field, then last name and student number.
- `GET /api/admin/review-graduate-filter-options?year=2026&term=END_YEAR&department=...&program=...` returns authorized department, program and major values. Fetch this when academic filters change, not for every search keystroke.
- `GET /api/admin/review-graduates/{studentNumber}/verification-events?year=2026&term=END_YEAR` returns up to 20 recent checks for an authorized graduate, including actor, time, source version and outcome.
- `POST /api/admin/verification-batches` applies one or many explicit graduate IDs. Example:

```json
{
  "year": 2026,
  "term": "END_YEAR",
  "studentNumbers": [20260001, 20260002],
  "outcome": "VERIFIED",
  "expectedVersions": { "20260001": null, "20260002": 1 },
  "sourceVersion": "RAC-final-2026-v1",
  "operationId": "2ee32fe4-537a-4540-b609-1bb6dd2d27da"
}
```

One ID follows the same service path as a batch. `expectedVersions` is null for Not checked and the listed integer for an existing Not on list case. `sourceVersion` must match the server's current official-list label, so a list replacement forces staff to refresh. The batch is limited to 100 unique IDs. If any record is missing, outside assignment, already verified or stale, the whole batch rolls back and returns a non-success response. A successful response reports each ID's new outcome/version. Retrying the same operation ID and identical payload returns the recorded response; using the ID with another payload returns 409.

No student record is copied or deleted. `ReviewCase` has a restrictive foreign key to `Student`; the existing deletion endpoint also rejects enrolled graduates with 409. Audit rows retain prior outcomes, checker and source version. An old registration approval or existing photo approval is not treated as RAC verification.

## Deployment and testing

The migration adds only enums, review tables, keys and checks. It assumes the existing Student/Admin/GraduationTerm schema is already present, so reconcile the real migration history and rehearse backup/restore before deployment. No database was migrated while creating this PR. Set `RAC_SOURCE_VERSION` in a **test** environment first; use test staff accounts and non-production graduate records. The official file's actual version and the policy for a replaced list must be confirmed before production use.

Build and contract tests can run without database credentials. Before enabling writes, test the migration and these API journeys against an isolated PostgreSQL database: scoped/forbidden reads, individual and mixed bulk changes, concurrent requests for the same graduate, retries, a Not on list correction, history, and direct delete attempts. Existing registration, booking and attendance paths need smoke checks after the migration.
