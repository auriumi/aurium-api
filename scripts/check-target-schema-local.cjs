// Rehearse the manual setup in a temporary schema inside the isolated local DB.
// Everything is rolled back; no existing table or migration history is modified.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const url = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '51218' || url.pathname !== '/template1') {
  throw new Error('Only the isolated local fixture database on port 51218 is allowed.');
}
async function run() {
  const db = new Client({ connectionString: url.href }); await db.connect();
  try {
    await db.query('BEGIN');
    const schema = `target_ddl_${randomUUID().replaceAll('-', '')}`;
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET LOCAL search_path TO "${schema}", public`);
    // Minimal copied dependencies keep foreign keys and event indexes off public tables.
    for (const name of ['Admin', 'ReviewOperation', 'InformationReviewEvent', 'PhotoReviewEvent']) {
      await db.query(`CREATE TABLE "${name}" (LIKE public."${name}" INCLUDING DEFAULTS)`);
    }
    await db.query('ALTER TABLE "Admin" ADD PRIMARY KEY (id)');
    await db.query('ALTER TABLE "ReviewOperation" ADD PRIMARY KEY (id)');
    const sql = readFileSync(join(__dirname, 'database/daily-targets-manual-setup.sql'), 'utf8')
      .replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');
    await db.query(sql);
    const checks = (await db.query(`SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=$1`, [schema])).rows.map(r => r.conname);
    for (const name of ['DailyTarget_role_check', 'ProofreadingDailyTarget_count_check', 'ProofreadingDailyTarget_version_check', 'ProofreadingTargetChange_count_check', 'ProofreadingTargetChange_operation_id_fkey']) {
      assert.ok(checks.includes(name), name);
    }
    const indexes = (await db.query('SELECT indexname FROM pg_indexes WHERE schemaname=$1', [schema])).rows.map(r => r.indexname);
    for (const name of ['DailyTarget_staff_cycle_role_date_key', 'InformationReviewEvent_first_submission_idx', 'InformationReviewEvent_target_decisions_idx', 'PhotoReviewEvent_target_work_idx']) assert.ok(indexes.includes(name), name);
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND tgname='ProofreadingTargetChange_immutable'`, [schema])).rows[0].count, 1);
    await db.query('SAVEPOINT repeat_setup');
    await assert.rejects(db.query(sql), /Target tables already exist/);
    await db.query('ROLLBACK TO SAVEPOINT repeat_setup');
    console.log('Manual SQL creates the final schema, constraints, indexes and audit trigger; repeat setup safely refuses. All rehearsal objects rolled back.');
  } finally {
    await db.query('ROLLBACK'); await db.end();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
