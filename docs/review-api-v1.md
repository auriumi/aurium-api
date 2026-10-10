# Graduate review API v1

The new review release uses `/api/v1/admin`. Existing authentication, registration, booking, attendance, staff account roles, Masterlist lists and exports retain their existing URLs.

| Workflow | Endpoints below `/api/v1/admin` |
| --- | --- |
| Own access | `GET /review-capabilities` |
| Staff assignments | `GET /review-staff`, `POST /review-assignments`, `PATCH /review-assignments/:id` |
| RAC/SAO verification by General Proofreaders | `GET /review-graduates`, `GET /review-graduate-filter-options`, `GET /review-graduates/:studentNumber/verification-events`, `POST /verification-batches` |
| Information review | `GET /information-reviews`, `GET /information-reviews/filter-options`, `GET /information-reviews/:reviewId`, `GET /information-reviews/:reviewId/revisions`, `GET /information-reviews/:reviewId/decision-events` |
| Information changes/decisions | `PATCH /information-reviews/:reviewId/draft`; `POST /information-reviews/:reviewId/submission`, `/qc-decision`, `/moderator-decision`, `/comments` |
| Photo review | `GET /photo-reviews`, `GET /photo-reviews/filter-options`, `GET /photo-reviews/:reviewId`, `GET /photo-reviews/:reviewId/decision-events` |
| Photo uploads/decisions | `POST /photo-reviews/:reviewId/uploads`, `/uploads/:assetId/finalize`, `/submission`, `/qc-decision`, `/moderator-decision`, `/comments` |
| IT correction | `GET /correction-requests`, `POST /review-tracks/:trackId/correction-requests`, `POST /correction-requests/:correctionId/decisions` |
| Published graduate detail | `GET /masterlist/:studentNumber` |

The same handlers remain available under `/api/admin` for compatibility with the existing test/client releases. These aliases share authentication, permission checks, origin validation and the same rate-limit instance; changing the prefix cannot bypass those controls. New clients use v1. Removing the aliases later requires a separate client migration and release decision.

Payloads, pagination, expected-version checks and operation IDs are unchanged. Versioning does not duplicate tables or graduate data. Services remain under `src/api/review`; `src/api/v1/admin_route.ts` makes the versioned entry point visible without copying the services.

General Proofreader assignments include RAC/SAO verification with the same academic scope. The historical `RAC_CHECK` enum/assignment rows remain for audit compatibility, but do not grant RAC access and cannot be newly assigned. Information review excludes solicitation records. Final information publication changes the live profile only on moderator approval. Masterlist photos follow the latest approved pair in the graduate's current year/term and retain that pair during IT reopening.
