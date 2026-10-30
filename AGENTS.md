# Aurium API technical notes

## Daily targets

- Keep the existing route → controller → service structure in `src/api/review/targets/`. Routes declare guards, controllers handle HTTP input/responses, and services own business rules and persistence.
- Mount the resource only at `/api/v1/admin/targets` in `src/api/v1/admin_route.ts`; there is no legacy alias. Keep the internal operation namespace unchanged so retries remain identifiable.
- Administrators and moderators with an active `FINAL_MODERATOR` designation manage targets. Staff with an active assignment for the requested role can read their own progress. Targets never grant access to graduate records or block further work.
- Each target belongs to a staff member, workflow role, graduation year/term and Manila date. Multiple department assignments for one role share a target; different roles have independent targets and backlog.

| Workflow role | One unit of work |
| --- | --- |
| General Proofreader | First information submission to QC |
| Information QC | First information QC approval or rejection |
| Photo Uploader | First complete photo-pair submission to QC |
| Photo QC | First photo QC approval or rejection |
| Moderator | First final approval or rejection per information/photo track; the two tracks count separately |

Select the earliest qualifying event across the full track history before filtering by staff/date. Drafts, RAC checks, comments, raw uploads, retries, rework and reassignment do not earn extra credit. Rejections count as decisions. Existing review events remain the source of truth; there is no stored progress counter or midnight job.

Backlog starts at the earliest configured target for that staff/role/cycle. For each day, use `max(0, prior backlog + target - counted work)`. Unscheduled days add no target, but work can clear old backlog; surplus cannot prepay future targets. Future-date figures are projections. Removing the last assignment for a role cancels only its future targets to zero, preserving today's target and history.

## API contract

All routes below are relative to `/api/v1/admin/targets` and require authentication. Summary, schedule and personal-progress queries accept `role`; omission defaults to General Proofreader.

- `GET /me?year=2026&term=END_YEAR`: own progress, defaulting to the server's current Manila date.
- `GET /?year=2026&term=END_YEAR&date=2026-10-26&page=1`: manager summary, 25 staff per page. Search/department filters select staff, not the scope of their personal totals. No graduate profiles or photos are returned.
- `GET /schedule?year=2026&term=END_YEAR&staffIds=1,2&dates=2026-10-26`: current values and versions for preview.
- `PUT /`: `{year, term, role, operationId, reason, entries: [{staffId, date, count, expectedVersion}]}`; new rows use `null` version. Cookie-authenticated writes require the configured frontend Origin.
- `GET /:targetId/history?page=1`: paginated immutable history.

Targets accept 0–10,000 for today through 365 days ahead, with at most 100 staff/date combinations per atomic request. Past dates are read-only. Require a reason, expected versions and operation UUID. A stale row rejects the whole batch; an exact retry returns the original response. Coordinate target writes and assignment changes using the existing shared lock. Do not change graduate/profile/photo data from this feature.

## Database setup and deployment

The final models are `ProofreadingDailyTarget` and `ProofreadingTargetChange` in [schema.prisma](prisma/schema.prisma). This feature adds no Prisma migration files. Keep existing migration history, CI and deployment configuration intact.

1. Koi confirms the intended database/schema, backs it up and rehearses the update in the team's isolated test database. Existing review tables such as `ReviewAssignment`, `ReviewCase`, `ReviewTrack`, `ReviewOperation`, `InformationReviewEvent` and `PhotoReviewEvent` must already exist; reconcile earlier schema/environment gaps first.
2. The [manual setup SQL](scripts/database/daily-targets-manual-setup.sql) is for a review-ready database with both target tables absent. Run the entire file with stop-on-error enabled only after review. It uses one transaction with bounded waits and refuses existing target tables. If either table exists, inspect differences instead of dropping/resetting it. Verify constraints, unique keys, foreign keys, audit trigger and event indexes as well as Prisma fields. Index creation can briefly block event writes; schedule accordingly.
3. Complete schema setup **before merging the backend**: the current main workflow deploys automatically, but `prisma generate` only generates a client. Assignment revocation also uses the target tables. Nothing runs this SQL from startup, CI or Prisma migrations. Do not use reset, `--accept-data-loss` or an unreviewed schema push.
4. Build/deploy and verify the backend with designated test staff before deploying the frontend. Set initial target dates explicitly; no automatic targets or historical obligations are created. On code rollback, retain the added tables and audit history.

## Validation

- Build: `npm run build`; service/request checks: `node --test tests/*.test.cjs`.
- Schema rehearsal: `node scripts/check-target-schema-local.cjs`. It runs the manual SQL in a temporary local schema, verifies constraints/indexes/audit protection and repeat-setup refusal, then rolls back the rehearsal.
- Database/API acceptance: build and provision the isolated fixture schema first, then run `node scripts/check-targets-local.cjs` with `DATABASE_URL`, `JWT_SAUCE`, `FRONTEND_ORIGIN` and local service settings supplied externally. Never commit credentials.
- Both database scripts enforce localhost:51218/template1. Acceptance leaves uniquely named `.invalid` fixtures and compares pre-existing Student rows; it does not clean up existing data. Do not repoint these scripts at production.

Recorded on 26 October 2026: build/schema validation, 62 service/request tests, 24 compiled contract tests and 49 local database/API assertions passed; pre-existing Student rows were unchanged. Manual SQL rehearsal passed. The user approved the UI flow before the route-only refactor; the API/client were rechecked afterward. These checks used isolated local Prisma/PGlite fixtures, **not Koi's shared test database or production**. Shared staging rehearsal and production-scale query timing remain outstanding.
