# Daily workflow targets

## Expanded scope: all review roles

The manager selects a workflow role: General Proofreader, Information QC, Photo Uploader, Photo QC or Moderator. A target belongs to a staff member **and that role**, date and graduation cycle. A multi-role staff member's goals and backlog are independent. Administrators and designated moderators manage all five roles; the broad Administrator account role alone is not a processing-work target.

| Role | One unit of work |
| --- | --- |
| General Proofreader | First information submission to QC |
| Information QC | First information QC approval or rejection |
| Photo Uploader | First complete photo-pair submission to QC |
| Photo QC | First photo QC approval or rejection |
| Moderator | First final approval or rejection per information or photo track; these are two separate reviews |

The first qualifying event across the full track history determines attribution. Rework, retries and changed reviewers cannot generate extra credit for the same role/track. Rejections count as decisions so staff are not encouraged to approve incorrect work to meet a target. Upload credit counts a submitted pair, not each photo or raw upload. Existing approval and publication rules are unchanged.

All list, schedule and personal-progress queries accept `role`; PUT accepts the same field at the top level. Omitting it retains General Proofreader behavior. The new resource is `/api/v1/admin/targets`; table names are unchanged. Targets are selected by role in the UI. Removing a role cancels only its future targets, and only after the last assignment for that role is removed.

Per Koi's review, this feature adds no files under `prisma/migrations` and does not change CI or database automation. Prisma defines the final tables and relations; `docs/database/daily-targets-manual-setup.sql` is a manual reference for Koi's schema update, including SQL constraints and audit protection that Prisma alone does not express. Review the database setup instructions below before deployment. No graduate records are rewritten.

The user confirmed manual visual and flow acceptance before the routing refactor. The refactor retains the feature behavior and updates both API and frontend together. Local test evidence and the remaining shared-database check are documented below.

Managers set an advisory target per staff member and workflow role, graduation cycle and Manila date. Several department assignments for the same role still share one target. Reaching it never blocks review work.

## Counting

Use the qualifying actions in the role table above. The earliest event is selected before filtering staff/date. Drafts, RAC verification, comments and repeated work do not add credit. Existing information and photo review events remain the source of truth.

Backlog starts at the person's earliest configured target for the cycle. Each day uses `max(0, prior backlog + target - first submissions)`. Unscheduled days add no target but work can clear prior backlog. Surplus does not prepay future targets. Historical submissions remain visible but cannot offset later targets before the target schedule starts.

Targets can be set for today through 365 days ahead, from 0 to 10,000, with at most 100 staff/date combinations per atomic request. Past targets are read-only. Changes require a reason, expected version and operation UUID; retrying the same operation returns its original response. A stale row rejects the entire batch.

An administrator or moderator with an active FINAL_MODERATOR designation can manage targets. Staff with an active assignment for the requested role can read their own progress. Targets do not grant graduate access. Removing the last assignment for a role cancels that role's future targets to zero and preserves history and today's target. Existing backlog remains historical; reassignment does not transfer it.

## Routes

All routes use the authenticated `/api/v1/admin/targets` resource, mounted only in `src/api/v1/admin_route.ts`. No legacy targets alias is added. `target_route.ts` contains route and guard declarations, `target_controller.ts` parses HTTP input and responses, and `target_service.ts` handles business rules and persistence.

- GET `/me?year=2026&term=END_YEAR` — own progress, server's current Manila date by default.
- GET `?year=2026&term=END_YEAR&date=2026-10-26&page=1` — 25 staff per page; optional search and department filters select people, not the scope of their personal totals.
- GET `/schedule?year=2026&term=END_YEAR&staffIds=1,2&dates=2026-10-26` — current target values and versions for preview.
- PUT root — `{year, term, role, operationId, reason, entries: [{staffId, date, count, expectedVersion}]}`. New rows use null version. Cookie-authenticated writes require the configured frontend Origin.
- GET `/:targetId/history?page=1` — paginated immutable change history.

Future-date backlog figures are projections. No midnight task or stored progress counter is needed. Summary queries aggregate event counts for the current page and return no graduate profiles or photos.

## Manual database setup and rollout for Koi

1. Review both the backend and frontend feature branches together. Keep the existing CI/deployment configuration unchanged.
2. Confirm which database and schema Prisma Studio is connected to; do not share connection passwords. The existing review feature needs `ReviewAssignment`, `ReviewCase`, `ReviewTrack`, `ReviewOperation`, `InformationReviewEvent` and `PhotoReviewEvent`, among other existing review models. If those are missing, stop and reconcile the existing schema/environment first. The targets setup does not install the older review release.
3. Back up PostgreSQL and rehearse the manual schema update on the team's isolated test database. If both target tables are absent and the existing review schema is ready, review `docs/database/daily-targets-manual-setup.sql` and execute the entire file with stop-on-error enabled. It runs in one transaction and refuses to recreate existing target tables. If either table already exists (for example after a manual Prisma schema synchronization), inspect the difference instead; do not drop or reset it. Verify the check constraints, unique keys, foreign keys, immutable audit trigger and event indexes against the SQL reference. `prisma generate` creates a client, not database tables. Do not run a reset, `--accept-data-loss`, or an unreviewed schema push.
4. Complete database setup **before merging this backend**: the existing main workflow deploys on push and does not update tables. Assignment revocation also uses the new tables. The manual setup creates only target tables and associated protections/indexes; it does not alter graduate/profile/photo data. Index creation can briefly block event writes; choose an appropriate maintenance window.
5. Generate the Prisma client, build and deploy the backend, then verify authenticated target reads/writes with designated test staff. Deploy the frontend after the API is available.
6. Set initial working dates deliberately; no automatic targets or historical obligations are created.
7. If rolling code back, restore the previous backend/frontend versions and retain the additive tables and history. Do not run a database reset or destructive down migration.

## Validation recorded on 26 October 2026

- Backend TypeScript build and Prisma schema validation passed.
- 62 service/request tests passed, including v1-only target routing and controller dispatch. The 24 compiled contract tests passed during feature validation.
- 49 guarded local database/API acceptance assertions passed, including concurrent stale saves, exact retry, atomic conflict rejection, authority/origin checks, immutable history, date boundaries, resubmission attribution and future-target cancellation.
- The local acceptance run compared every pre-existing Student row before/after: unchanged.
- Frontend production build, lint and seven client tests passed.

The local database is the existing isolated Prisma/PGlite fixture database at localhost:51218/template1, configured in the workspace's `aurium-local-test-api/.env`. Credentials are not committed. It was provisioned locally for tests; neither Koi's shared test database nor production was connected to or updated. This explains why local tests pass while another Prisma Studio connection can show different tables. The screenshot alone cannot identify the selected database or establish its schema readiness.

The manual setup SQL was also executed inside a temporary local schema with copied minimal dependencies: final constraints, indexes and immutable audit trigger were verified, repeat setup refused safely, and all rehearsal objects were rolled back. This is a schema test, not a shared staging or production rehearsal. Koi still needs to confirm the shared test database configuration, rehearse there and check production-scale query timing. No production deployment or merge has been performed for this feature.

To repeat local acceptance, build first and provision the final schema in the isolated fixture database; run `node scripts/check-targets-local.cjs` with DATABASE_URL, JWT_SAUCE, FRONTEND_ORIGIN and local-only service settings supplied externally. The script enforces localhost:51218/template1 and leaves uniquely named `.invalid` fixtures rather than deleting existing data. `node scripts/check-target-schema-local.cjs` rehearses the SQL in a rolled-back temporary schema on that same local database. Neither script should be repointed at production. Shared staging tests need a separately confirmed environment and test accounts.
