# Isolated frontend origin

Set `FRONTEND_ORIGIN` on a test API server to the exact HTTPS origin of the test UI, for example `https://test.aurium.example`. The API uses this one value for CORS and the review-write Origin check. Paths, trailing slashes, credentials, wildcards and nonlocal HTTP are rejected at startup. Local development may use an exact `http://localhost:<port>` origin. When unset, the existing production and local defaults remain unchanged.

Set the UI's `NEXT_PUBLIC_LOCAL_URL` to the corresponding test API base URL. This configuration alone does not isolate data: use a separate PostgreSQL database, R2 account/bucket, and fictional staff/graduate accounts. Do not enable the review workflow on production until the migration and role-based acceptance checks pass.
