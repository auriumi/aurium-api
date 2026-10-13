# Graduate review API v1

New clients use resource-based URLs under `/api/v1/admin`. Existing registration, authentication, booking, attendance, Masterlist lists/exports and account-role URLs are unchanged.

## Entry point and security

`src/server.ts` mounts `/api/v1/admin` with the shared admin rate limiter, `verifyToken` and `isAdmin`, before `src/api/v1/admin_route.ts`. The existing `/api/admin` parent has the same guards. A permission check protects each review route; service-level assignments and academic scope further constrain access. Cookie-authenticated writes also require the configured frontend origin.

`tests/review-http-boundary.test.cjs` dispatches Node request/response objects through those actual server/router mounts with controller sentinels and no database or network socket. It covers anonymous/invalid/student tokens, forbidden staff roles, canonical and legacy dispatch, every write's origin check, and the shared rate limit. Existing service tests cover assignment and workflow rules separately.

## Resource folders

`src/api/review/review_route.ts` composes the routers. Each resource owns its controller, services, input contracts and route file. Common scope, error, filter, history and origin helpers live in `shared/`.

| Folder | Responsibility |
| --- | --- |
| `assignments/` | Own capabilities, staff listing and scoped role assignments |
| `rac/` | Official-list verification and graduate eligibility |
| `information/` | Drafts, revisions, comments, QC and moderator decisions |
| `photos/` | Uploads, validation, photo pairs, comments and decisions |
| `corrections/` | Requests and controlled reopening after final approval |

## Canonical paths

Every path below is relative to `/api/v1/admin`. Payloads, pagination, expected-version checks and operation IDs are unchanged.

| Resource | Endpoints |
| --- | --- |
| Own access | `GET /capabilities` |
| Assignments | `GET /staff`, `POST /assignments`, `PATCH /assignments/:id` |
| RAC | `GET /rac/graduates`, `GET /rac/graduates/filter-options`, `GET /rac/graduates/:studentNumber/verification-events`, `POST /rac/verification-batches` |
| Information reads | `GET /information/reviews`, `/information/reviews/filter-options`, `/information/reviews/:reviewId`, `/information/reviews/:reviewId/revisions`, `/information/reviews/:reviewId/decision-events` |
| Information writes | Under `/information/reviews/:reviewId`: `PATCH /draft`; `POST /submissions`, `/qc-decisions`, `/moderator-decisions`, `/comments` |
| Photo reads | `GET /photos/reviews`, `/photos/reviews/filter-options`, `/photos/reviews/:reviewId`, `/photos/reviews/:reviewId/decision-events` |
| Photo writes | Under `/photos/reviews/:reviewId`: `POST /uploads`, `/uploads/:assetId/finalization`, `/submissions`, `/qc-decisions`, `/moderator-decisions`, `/comments` |
| Corrections | `POST /tracks/:trackId/corrections`, `GET /corrections`, `POST /corrections/:correctionId/decisions` |
| Published graduate | `GET /masterlist/:studentNumber` |

## Compatibility

`legacy_review_route.ts` retains the original `review-capabilities`, `review-staff`, `review-assignments`, `review-graduates`, `review-graduate-filter-options`, `verification-batches`, `information-reviews`, `photo-reviews`, `review-tracks/:trackId/correction-requests` and `correction-requests` URLs, including their original subpaths, at both `/api/admin` and `/api/v1/admin`.

Aliases call the same controllers with the same guards; they neither redirect nor duplicate business logic. Changing prefixes does not bypass authentication, origin validation or rate limiting. Each resource router audits its own leaf routes because the existing route auditor is not recursive. Removing aliases requires a separate client compatibility decision.

The URL/folder refactor changes no schema. General Proofreaders still perform RAC verification; emails remain read-only; information publishes only on final moderator approval; Masterlist retains the prior approved photo pair while a correction is open. Existing SQL migrations and history are preserved.
