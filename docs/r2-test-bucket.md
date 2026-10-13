# R2 bucket for isolated review testing

`R2_BUCKET` selects the bucket for both legacy/reference photo reads and the new reviewed photo uploads. When unset, it stays `aurium`, preserving the current deployment behavior. Set it to a dedicated bucket name together with separate `R2_ACC_ID`, `R2_ACC_KEY`, and `R2_SECRET_KEY` in the **test server environment**; never put those credentials in source control.

Use fictional records and a test R2 account/bucket with browser PUT CORS. Do not point a test server at a copy of live graduate data or production storage: stored photo URLs and object keys belong to their original environment. Verify upload, finalization, refresh and signed reads there before rollout. This PR only makes bucket selection possible; it does not provision or migrate storage.
