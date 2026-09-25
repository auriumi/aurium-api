# Information review read API

This PR adds read-only production data for the graduate information workspace. A staff member needs an active `INFORMATION_PROOFREADER`, `INFORMATION_QC`, or `FINAL_MODERATOR` assignment. The API combines that staff member's assigned academic scopes and rechecks them for the list, counts, filter options, and detail. An administrator role alone grants no information review access.

## Resources

- `GET /api/admin/information-reviews?year=2026&term=END_YEAR&queue=ALL&page=1&department=...&program=...&major=...&search=...` returns at most 25 rows sorted by the stored first name, then last name and student number. It includes `total` for the selected queue and `counts` for the same authorized cycle, search and academic filters. `ALL` is status-only and can include unchecked/not-listed graduates with `reviewId: null`. Other queues include only RAC-verified graduates with an information track. The `APPROVED_QC` queue includes both approved-at-QC and submitted-to-moderator stages; each row retains its exact stage.
- `GET /api/admin/information-reviews/filter-options?year=2026&term=END_YEAR&department=...&program=...` returns authorized academic options for the current cycle. It does not use the name search, so it need not run on every keystroke.
- `GET /api/admin/information-reviews/{reviewId}` returns the complete permitted profile for a RAC-verified information track, its exact review stage/version and RAC provenance. A missing or out-of-scope review returns the same 404. The response includes `availableActions: []` because this PR adds no editing or decision endpoints.

The profile explicitly selects name, nickname, student number, graduation cycle, academic fields, emails, birthdate, address, contact and parent/guardian fields, solicitations, registration/schedule/attendance summary, and an authorized, short-lived reference-photo URL. Student/Auth password hashes, session data, raw object-storage keys and unsigned URLs are never returned. The registration reference photo is read-only and is not a submitted graduation/theme photo. All personal-data responses use `Cache-Control: private, no-store`.

## Review and rollout

This PR is based on the RAC verification API. It has no database migration or write operation. The frontend integration is separate. A missing student detail or reference photo returns null fields without breaking the rest of the profile. The resource tests cover queue mapping, full given-name search terms and academic scope construction; TypeScript and prior RAC tests also pass.

Before enabling the UI, test counts across pages, scope isolation, detail 404 behavior, null data, expired sessions and query plans against an isolated PostgreSQL database with representative data. No live database was accessed while creating this PR.
