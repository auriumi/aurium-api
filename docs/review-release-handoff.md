# Review v1 handoff to Koi

Updated 13 October 2026 for the request to review a complete working process. This replaces the earlier nine-PR merge sequence. Main and production are not changed by preparing this handoff.

## Two complete changes

- [API #148](https://github.com/auriumi/aurium-api/pull/148): the complete review backend, Prisma schema/14 SQL migrations, staff assignments, approved Masterlist reader and manual deployment gate from #149.
- [Frontend #210](https://github.com/auriumi/aurium-yearbook/pull/210): all review workspaces, staff assignment UI, approved Masterlist view and matching v1 clients.

These should both target main after consolidation. Confirm their actual bases and latest checks on GitHub before merging. API #145–147/#149 and UI #207–209 are superseded only after their exact heads are confirmed as ancestors of the complete PRs. Keep their branches and review discussions; do not merge them individually. The release spans two repositories, so both candidates must be tested together.

## Changes addressing the review

- The backend now has `assignments/`, `rac/`, `information/`, `photos/`, `corrections/` and `shared/` folders under `src/api/review`, with a route/controller/service structure for each resource.
- Canonical paths use `/api/v1/admin/capabilities`, `/assignments`, `/rac/graduates`, `/information/reviews`, `/photos/reviews` and `/corrections`. See [the full route map](review-api-v1.md). Both old review prefixes remain as guarded aliases for compatibility.
- The server-level limiter, JWT and administrator guards were already present. New tests dispatch requests through the real application/router chain to demonstrate those protections, every write's origin guard, and the shared rate limit. Controller sentinels isolate these tests from databases/storage; existing service tests verify workflow authorization separately.
- Frontend clients use the new canonical paths. Masterlist request failures have an error message and manual Retry, separate from an empty result; 429 responses show wait guidance when available. Obsolete requests still abort.
- Database changes stay manual. Neither deployment workflow applies migrations; no schema reset, data reseed or storage cleanup belongs to this release.

## Agreed behavior

Proofreaders manually confirm RAC/SAO records within their assignment scope. Information excludes solicitations and keeps both emails read-only. Draft edits replace live Student/StudentDetail values only after final moderator approval. QC approval and forwarding remain separate; rejections require a comment. Moderator rejections go to the maker, then through QC again.

Photo review uses a graduation/theme pair with the registration reference shown separately. Masterlist shows approved information and the latest final-approved photo pair; IT reopening retains the previous publication. Designated moderators grant scoped operational assignments; administrators retain high-privilege designations and broad account roles.

## Validation and limits

Run the API schema validation/build, compiled contract tests and `node --test tests/*.test.cjs` on a clean build. The original suite has 61 tests; the new request-boundary suite adds five scenarios plus its parent test. The frontend requires TypeScript, lint, production build, `node scripts/check-information-workspace.cjs` and `node --test scripts/check-review-clients.cjs`. Refer to the latest CI result rather than an older passing commit.

Before this refactor, isolated acceptance passed 14 review journey checkpoints, five staff checkpoints and 20 rollback-only database guard probes. Existing fictional graduate and staff rows were preserved. Those tests used PGlite and loopback storage; the old results are not a fresh end-to-end sign-off of the refactor or evidence of production PostgreSQL/R2 behavior. Repeat the complete journeys on the final candidates.

Automatic Excel/CSV reconciliation and the broader department/cycle/locked-revision export plan are not implemented in this manual-verification release. Request/query reductions exist, but scale performance has not been benchmarked. October 11 audits reported four high API Prisma-chain findings and two moderate frontend ExcelJS/uuid findings; review current applicability and safe fixes separately. Do not force major dependency downgrades to clear a report.

## Merge and deployment sequence

1. Confirm both final PR heads, review the complete diffs, obtain passing checks and rehearse merging each onto current main. Keep automatic deployment paused. The API candidate includes the manual gate, but confirm no older push-triggered job is queued/running.
2. Merge the complete API PR, then the complete frontend PR. Record both resulting main SHAs and rerun final checks. No intermediate feature-stack merges are needed. Code merge is not database migration or release approval.
3. Koi identifies the isolated test database, verifies its schema/history and backup restore, and rehearses the 14 pending migrations there. Main has no committed older migration history; inspect actual `_prisma_migrations`. If needed, baseline only the already-existing schema, including custom SQL, in a reviewed change. Never copy the dummy baseline or mark unapplied review migrations applied.
4. Use the locked Prisma 7.10.0 tooling before pruning development dependencies. `prisma generate` only generates a client; `prisma migrate deploy` deliberately applies pending committed SQL. `db push` alone is not a substitute: this release also uses custom triggers and constraints. Preserve migration order and enum transaction boundaries. Do not reset/truncate/drop production data.
5. Verify private test R2, HTTPS origins, secure cookies, reverse proxy, configuration and real staff assignments. Test both new journeys and existing sign-in, registration/verification, scheduling/booking, attendance, exports and ordinary roles. Measure representative thousands of fictional graduates with 10–15 staff, including one shared IP and rate-limit handling.
6. After Koi approves staging and recovery, prepare the exact release builds, take/verify the production backup, deliberately apply the reviewed migrations, then start/health-check the API and deploy/health-check the matching frontend. The API workflow accepts the exact main SHA and an operator migration confirmation; it does not inspect/migrate the database. The UI workflow still uses `git pull`: hold the reviewed main revision stable and verify the deployed SHA.
7. Enable one agreed department/program pilot and confirm approved information/photos in Masterlist before expanding. Existing records are not automatically enrolled. Never use a random real graduate as a test fixture.

The SQL adds review objects without deleting or backfilling graduate rows, but it intentionally restricts legacy photo writes for enrolled graduates and deletion of referenced records. Old main is not a proven recovery target after enrollment because it lacks some review guards. The VPS deployment builds in place and is not atomic. Retain a tested compatible fallback or forward-fix procedure; freeze affected writes on failure rather than dropping tables or restoring over newer writes.

## Test database location

The workspace search on October 13 found the known local dummy database and remote `DATABASE_URL` settings with no confirmed staging designation. No remote database was accessed. Koi's reported test database still needs an identified configuration location and isolation confirmation. Keep credentials out of PRs and documentation.
