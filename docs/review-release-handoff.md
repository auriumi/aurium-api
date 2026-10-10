# Review v1: handoff to Koi

Prepared 11 October 2026. These PRs are for review and combined testing. Nothing has been merged to main or deployed to production by this implementation work.

## Review order

| Group | API PR | Frontend PR |
| --- | --- | --- |
| Deployment gate, before feature merges | #149 | Existing deployment is manual |
| RAC/SAO verification and scoped access | #145 | auriumi/aurium-yearbook#207 |
| Information proofreading and final approval | #146 | auriumi/aurium-yearbook#208 |
| Photo pair upload and approval | #147 | auriumi/aurium-yearbook#209 |
| Staff assignments, corrections and Masterlist integration | #148 | auriumi/aurium-yearbook#210 |

The 42 older roadmap PRs were closed with replacement links after verifying their head commits were retained in the grouped branches. Original branches and comments remain available. Each group is based on the preceding group. Prefer merge commits to preserve ancestry; if squashing/rebasing, restack the next PR and verify its diff before proceeding. Retarget the next group to main only after its dependencies are present. Do not deploy intermediate groups.

## Agreed behavior

- General Proofreaders verify RAC/SAO records within their information assignment scope. Historical RAC-only designations grant no current access; their rows are retained.
- Information review excludes solicitations and keeps both email addresses read-only. Draft edits publish to Student/StudentDetail only after final moderator approval.
- QC approval and forwarding are separate. Rejections require comments. Moderator returns go to the original maker, then through QC again.
- Photo review uses a graduation/theme pair and shows the registration reference separately. Masterlist fetches current approved details and the last final-approved pair. IT reopening retains the previous publication until another final approval.
- Designated moderators manage scoped proofreader/QC/uploader assignments. Administrators retain high-privilege designation and broad account-role management. Revocation preserves history and takes effect on subsequent requests.
- New review APIs use `/api/v1/admin`; legacy aliases share the same handlers and rate limiter. Existing authentication, registration, schedules and other legacy URLs are preserved. See [API routes](review-api-v1.md).

## Validation completed

- Backend build, 37 service/request tests and 24 compiled contract/image tests pass.
- Frontend TypeScript, ESLint, production build and existing information workspace checks pass on the combined implementation. Each grouped PR has its own CI; use its latest commit result.
- Isolated local acceptance passed 14 checkpoints covering both review journeys, required rejection comments, duplicate/stale/origin/role guards, publication timing, actual final image bytes and publication during IT reopening.
- Five staff acceptance checkpoints cover scoped grant/revoke, duplicate prevention, immediate access changes and retained history. Twenty database guard probes passed and rolled back.
- Pre-existing local Student, StudentDetail, StudentAuth and StudentImage rows were compared as complete JSON before/after acceptance and remained unchanged. Staff checks also preserved existing Admin and assignment rows.
- Browser inspection confirmed the moderator's allowed role choices, explicit scope selection, approved Masterlist information/photos and the correction-in-progress notice. The missing thesis title uses the normal empty state.

These tests use fictional `.invalid` accounts, local PGlite and a loopback object store. They do not establish production PostgreSQL concurrency, R2 policy correctness or performance with thousands of graduates. An initial local transaction isolation error did not recur in direct probes or the completed journey; repeat the journey and concurrent approval/read checks on staging PostgreSQL.

## Production connection: Koi's release gates

1. Review/merge #149 first, or otherwise pause automatic API deployment before feature merges. The current main workflow deploys on push and does not apply review migrations. The new gate is manual; its migration checkbox is an operator confirmation, not an automatic migration check.
2. Inspect the actual database schema and `_prisma_migrations`. Verify and rehearse restoration from a backup. Do not infer the existing baseline from the local dummy database or mark unapplied review migrations as applied.
3. Rehearse the additive review migrations using the locked Prisma version on an isolated copy of the actual schema. Verify existing graduate counts/values, legacy constraints, enum migration order and a compatible recovery procedure. Never reset/drop production tables or copy local test data into production.
4. Verify private R2 credentials/bucket settings, the existing API/frontend origins, reverse proxy and secure cookie behavior. Test real R2 upload/finalization/read flows in a separate test bucket. Do not include local Prisma/storage adapters in the release.
5. Test registration, sign-in, schedules, attendance, exports and the complete new journeys together. Measure p50/p95 latency and errors with thousands of fictional graduates and 10–15 staff, including one shared office IP. The existing admin limit is 100 requests per three minutes; local tests hit 429 and respected Retry-After. Request/query reductions are implemented, but no production-scale speed claim is made.
6. Review remaining dependency advisories separately. Compatible patches include Next.js 16.3.8, source-map-js 1.2.2 and proxy-addr 2.0.8. Do not force a Prisma downgrade or ExcelJS downgrade merely to clear an audit report.
7. After all gates pass, deploy an exact reviewed main commit deliberately. The VPS workflow still builds in place: retain the previous working release and rehearse recovery. Code rollback alone must not bypass review protections or discard approved changes.
