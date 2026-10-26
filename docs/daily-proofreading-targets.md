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

All list, schedule and personal-progress queries accept `role`; PUT accepts the same field at the top level. Omitting it retains General Proofreader behavior. The existing resource/table names are retained to avoid an unrelated rename. New targets are selected by role in the UI. Removing a role cancels only its future targets, and only after the last assignment for that role is removed.

Apply **both** target migrations in timestamp order, including `20261026120000_daily_target_roles`, before running the new backend. The second migration preserves existing local proofreader targets with that role as the default, replaces their unique index with staff/cycle/role/date uniqueness and adds indexes for QC/moderator/photo work. No graduate records are rewritten.

Updated validation: 61 backend service/request tests and 49 local database/API acceptance assertions passed, including all five roles, distinct multi-role targets, rejection/reapproval deduplication, two moderator workspaces, role authorization and role-specific cancellation. The frontend production build passed. The user confirmed manual visual and flow acceptance. Production PostgreSQL performance remains a separate rollout check.

Managers set an advisory target per staff member and workflow role, graduation cycle and Manila date. Several department assignments for the same role still share one target. Reaching it never blocks review work.

## Counting

Use the qualifying actions in the role table above. The earliest event is selected before filtering staff/date. Drafts, RAC verification, comments and repeated work do not add credit. Existing information and photo review events remain the source of truth.

Backlog starts at the person's earliest configured target for the cycle. Each day uses `max(0, prior backlog + target - first submissions)`. Unscheduled days add no target but work can clear prior backlog. Surplus does not prepay future targets. Historical submissions remain visible but cannot offset later targets before the target schedule starts.

Targets can be set for today through 365 days ahead, from 0 to 10,000, with at most 100 staff/date combinations per atomic request. Past targets are read-only. Changes require a reason, expected version and operation UUID; retrying the same operation returns its original response. A stale row rejects the entire batch.

An administrator or moderator with an active FINAL_MODERATOR designation can manage targets. Staff with an active assignment for the requested role can read their own progress. Targets do not grant graduate access. Removing the last assignment for a role cancels that role's future targets to zero and preserves history and today's target. Existing backlog remains historical; reassignment does not transfer it.

## Routes

All routes use the existing authenticated `/api/v1/admin/proofreading-targets` resource:

- GET `/me?year=2026&term=END_YEAR` — own progress, server's current Manila date by default.
- GET `?year=2026&term=END_YEAR&date=2026-10-26&page=1` — 25 staff per page; optional search and department filters select people, not the scope of their personal totals.
- GET `/schedule?year=2026&term=END_YEAR&staffIds=1,2&dates=2026-10-26` — current target values and versions for preview.
- PUT root — `{year, term, operationId, reason, entries: [{staffId, date, count, expectedVersion}]}`. New rows use null version. Cookie-authenticated writes require the configured frontend Origin.
- GET `/:targetId/history?page=1` — paginated immutable change history.

Future-date backlog figures are projections. No midnight task or stored progress counter is needed. Summary queries aggregate event counts for the current page and return no graduate profiles or photos.

## Migration and rollout for Koi

1. Review both the backend and frontend feature branches together. Keep the existing CI/deployment configuration unchanged.
2. Back up PostgreSQL and confirm the target environment and migration history. Rehearse `20261026090000_daily_proofreading_targets` on an isolated PostgreSQL environment first. Review pending migrations before using the team's normal manual deployment procedure; do not blindly apply unrelated pending migrations.
3. Apply the additive migration **before deploying this backend**. Assignment revocation also uses the new tables. It adds two tables, restrictive foreign keys, count checks, immutable history, and a partial index on first-submission events. It does not reset, delete, copy or replace graduate/profile/photo data. The index can briefly block writes while being created; schedule accordingly for the production dataset.
4. Generate the Prisma client, build and deploy the backend, then verify authenticated target reads/writes with designated test staff. Deploy the frontend after the API is available.
5. Set initial working dates deliberately; no automatic targets or historical obligations are created.
6. If rolling code back, restore the previous backend/frontend versions and retain the additive tables and history. Do not run a database reset or destructive down migration.

## Validation recorded on 26 October 2026

- Backend TypeScript build and Prisma schema validation passed.
- 61 service/request tests and 24 compiled contract tests passed.
- 49 guarded local database/API acceptance assertions passed, including concurrent stale saves, exact retry, atomic conflict rejection, authority/origin checks, immutable history, date boundaries, resubmission attribution and future-target cancellation.
- The local acceptance run compared every pre-existing Student row before/after: unchanged.
- Frontend production build, lint and seven client tests passed.

The local database is the existing isolated Prisma/PGlite fixture database on port 51218, not production PostgreSQL. This does not establish production throughput or migration timing. Koi should rehearse the migration and check query timing against representative staging data. The user confirmed manual visual and flow acceptance on 26 October 2026; no production deployment or merge has been performed for this feature.

To repeat database acceptance, build first, apply the migration only to the isolated fixture database, then run `node scripts/check-targets-local.cjs` with DATABASE_URL, JWT_SAUCE, FRONTEND_ORIGIN and local-only service settings supplied externally. The script enforces localhost:51218/template1 and leaves uniquely named `.invalid` fixtures rather than deleting existing data. Never point it at production.
