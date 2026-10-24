# Manual RAC/SAO verification

The moderator supplies the official list outside Aurium. A General Proofreader compares each graduate with that list, then confirms the graduate or marks them Not on list. Aurium records the staff decision; it does not import a file or automatically match names. Reference notes and a configured list version are not required.

## Access and workflow

The staff account needs an active `INFORMATION_PROOFREADER` assignment covering the graduate's department, course and major. There is no separate RAC reviewer. An admin role or retired `RAC_CHECK` assignment alone is insufficient. Reads and writes check the current assignment, academic scope and graduation cycle.

No case means Not checked. Not on list retains the graduate and may later become Verified. Verified cannot be changed by this endpoint. Confirmation creates independent information and photo draft tracks in the same transaction. It does not publish information or photos and does not delete or copy a student record.

## API

Canonical paths are under `/api/v1/admin/rac`; the existing legacy aliases still use the same controllers.

- `GET /graduates?year=2026&term=END_YEAR&verification=UNCHECKED&page=1&department=...&program=...&major=...&search=...` returns at most 25 authorized graduates, totals and scoped counts. Status is `ALL`, `UNCHECKED`, `NOT_LISTED` or `VERIFIED`. Sort order is **last name A-Z, first name A-Z, student number ascending**, applied in the database before pagination. The information and photo lists use the same order.
- `GET /graduates/filter-options?year=2026&term=END_YEAR&department=...&program=...` returns scoped academic choices. Filters narrow access; they never expand an assignment.
- `GET /graduates/:studentNumber/verification-events?year=2026&term=END_YEAR` returns up to 20 checks, including actor, time, source and outcome.
- `POST /verification-batches` applies one or more explicit graduate IDs:

```json
{
  "year": 2026,
  "term": "END_YEAR",
  "studentNumbers": [20260001, 20260002],
  "outcome": "VERIFIED",
  "expectedVersions": { "20260001": null, "20260002": 1 },
  "operationId": "2ee32fe4-537a-4540-b609-1bb6dd2d27da"
}
```

`expectedVersions` is null for Not checked and the displayed integer for Not on list. The batch allows 1-100 unique IDs. Cookie-authenticated writes require the configured frontend `Origin`. Missing, out-of-scope, already-verified or stale records roll back the whole batch. Repeating the same operation ID and payload returns the stored response; reusing it with different records, versions or outcome returns 409.

## Provenance and compatibility

New cases and events store `Manual verification` in the existing `source_version` column. This identifies the method, **not** an official file revision or automatic validation. The checker, time, cycle and outcome remain recorded. Existing cases/events with earlier source labels are not rewritten; a later permitted confirmation appends a new event and updates the case's current decision.

The list's top-level `sourceVersion` returns `Manual verification` so older deployed clients that require a non-empty value remain usable. New clients may omit `sourceVersion` from a batch. Older clients may still send a valid label; it is retained in the request fingerprint for replay compatibility but cannot set the provenance of a new event. `RAC_SOURCE_VERSION` is no longer read or required. Old clients may need to refresh their list after the API deploys.

## Deployment and validation

This fix adds no schema changes or migration. Deploy the API first, then the matching frontend that explains manual checking. Do not reset or reseed an existing database, change CI configuration, or automate a production migration for this fix.

Run `npm run build`, then `node --test tests/rac-contract.test.cjs tests/rac-proofreader-access.test.cjs tests/rac-manual-service.test.cjs tests/review-list-order.test.cjs`. These tests replace database/storage boundaries and do not connect to live data. Rehearse individual/bulk confirmation, Not on list, scoped denial, concurrent/stale requests and replay on an isolated PostgreSQL database with dummy graduates before production acceptance.
