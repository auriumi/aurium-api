# Review release deployment gate

Merge this small PR before any review feature PR. An ordinary merge/push to main will no longer deploy the API. This workflow is manual, accepts an exact reviewed main commit, serializes releases and stops on failed commands.

Koi must verify a restorable PostgreSQL backup, the actual database schema and migration history, then rehearse the review migrations with isolated PostgreSQL and R2 before the first release. Apply the required migrations deliberately using the locked Prisma version; `prisma generate` does not apply them. The required confirmation records the operator's check; it does not inspect or migrate the database automatically.

Do not reset the database, invent its existing migration baseline, mark unapplied review migrations as applied, or use a destructive rollback. Historical graduate records and existing storage objects must remain intact. Test registration, authentication, schedules and exports alongside the new review journeys.

The workflow still builds in the existing VPS checkout. It does not provide atomic releases or automatic recovery; Koi must retain the previous working release and rehearse a compatible recovery procedure. Do not start a deployment until those operational checks are complete. No production workflow was run when preparing this PR.
