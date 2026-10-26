// Run after build and migration, only against the isolated local fixture database.
// Intentionally leaves uniquely named .invalid fixtures; never resets existing data.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '51218' || url.pathname !== '/template1') {
  throw new Error('This acceptance script requires the isolated local fixture database on port 51218.');
}
const db = require('../dist/config/prisma').default;
const service = require('../dist/api/review/targets/target_service');
const { revokeAssignment } = require('../dist/api/review/assignments/staff_assignment_service');
const { manilaDate } = require('../dist/api/review/targets/target_contract');
const today = manilaDate();
const shift = n => new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);
const cycle = { year: 2026, term: 'END_YEAR' };
let server, passed = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); passed++; };
const rejects = async (action, status) => { await assert.rejects(action, e => e.status === status); passed++; };
async function main() {
  const existingStudents = await db.student.findMany({ orderBy: { id: 'asc' } });
  const tag = randomUUID();
  const staff = async (name, role) => db.admin.create({ data: { first_name: 'Target test', last_name: name,
    email: `${name}.${tag}@aurium.invalid`, hashed_password: 'disabled-test-login', role } });
  const manager = await staff('Manager', 'ADMINISTRATOR');
  const proofreader = await staff('Proofreader', 'MEMBER');
  const other = await staff('Other', 'MEMBER');
  const moderator = await staff('Undesignated', 'MODERATOR');
  const assignment = department => db.reviewAssignment.create({ data: { admin_id: proofreader.id,
    granted_by: manager.id, capability: 'INFORMATION_PROOFREADER', department } });
  const a = await assignment('DAE'), b = await assignment('DBA');
  const batch = (entries, reason = '') => ({ ...cycle, entries, reason, operationId: randomUUID() });
  const entry = (date, count, expectedVersion = null) => ({ staffId: proofreader.id, date, count, expectedVersion });
  const initial = batch([entry(today, 4), entry(shift(1), 10)]);
  const saved = await service.saveTargets(manager.id, initial);
  check(saved.success, true);
  check(await service.saveTargets(manager.id, initial), saved);
  check(await db.proofreadingTargetChange.count({ where: { changed_by: manager.id } }), 2);
  await rejects(() => service.saveTargets(manager.id, { ...initial, reason: 'different' }), 409);
  await rejects(() => service.saveTargets(proofreader.id, batch([entry(shift(2), 20)])), 403);
  await rejects(() => service.saveTargets(moderator.id, batch([entry(shift(2), 20)])), 403);
  await rejects(() => service.saveTargets(manager.id, batch([{ ...entry(shift(2), 20), staffId: other.id }])), 409);
  await rejects(() => service.saveTargets(manager.id, batch([entry(shift(-1), 20)])), 400);
  await rejects(() => service.saveTargets(manager.id, batch([entry(today, 30, 1)])), 400);
  await rejects(() => service.saveTargets(manager.id, batch([entry(shift(2), 20), entry(today, 30, 999)], 'Adjustment')), 409);
  check(await db.proofreadingDailyTarget.count({ where: { staff_id: proofreader.id } }), 2);
  const updates = await Promise.allSettled([20, 30].map(count => service.saveTargets(manager.id, batch([entry(today, count, 1)], 'Concurrent adjustment'))));
  check(updates.filter(r => r.status === 'fulfilled').length, 1);
  check(updates.filter(r => r.status === 'rejected' && r.reason.status === 409).length, 1);
  await service.saveTargets(manager.id, batch([entry(today, 4, 2)], 'Acceptance fixture'));
  // Past targets are seeded directly for arithmetic testing; the public API forbids this.
  await db.proofreadingDailyTarget.create({ data: { staff_id: proofreader.id, grad_year: cycle.year,
    grad_term: cycle.term, target_date: new Date(shift(-1)), target_count: 5 } });
  let number = (await db.student.aggregate({ _max: { student_number: true } }))._max.student_number + 1;
  const event = async (trackId, actorId, time, version = 1, action = 'SUBMITTED_QC') => {
    const op = await db.reviewOperation.create({ data: { actor_id: actorId, client_key: randomUUID(), request_hash: 'a'.repeat(64) } });
    const revision = await db.reviewRevision.create({ data: { track_id: trackId, track_version: version + 1,
      before_snapshot: {}, after_snapshot: {}, canonical_hash: 'a'.repeat(64), created_by: actorId, operation_id: op.id } });
    return db.informationReviewEvent.create({ data: { track_id: trackId, track_version: version + 1, actor_id: actorId,
      revision_id: revision.id, operation_id: op.id, action, from_stage: 'DRAFT',
      to_stage: action === 'COMMENTED' ? 'DRAFT' : 'SUBMITTED_QC', note: action === 'COMMENTED' ? 'Fixture comment' : null,
      created_at: new Date(time) } });
  };
  const track = async (date, actor = proofreader.id) => {
    const student = await db.student.create({ data: { student_number: number++, personal_email: `${randomUUID()}@aurium.invalid`, first_name: 'Target fixture' } });
    const review = await db.reviewCase.create({ data: { student_id: student.id, grad_year: cycle.year,
      grad_term: cycle.term, outcome: 'VERIFIED', checked_by: manager.id, source_version: 'isolated-target-test' } });
    const t = await db.reviewTrack.create({ data: { case_id: review.id, type: 'INFORMATION' } });
    await event(t.id, actor, date);
    return t;
  };
  for (let i = 0; i < 3; i++) await track(`${shift(-1)}T04:00:00Z`);
  for (let i = 0; i < 5; i++) await track(`${today}T04:00:00Z`);
  const old = await track(`${shift(-2)}T04:00:00Z`);
  await event(old.id, proofreader.id, `${today}T05:00:00Z`, 2);
  const reassigned = await track(`${shift(-2)}T04:00:00Z`, other.id);
  await event(reassigned.id, proofreader.id, `${today}T05:00:00Z`, 2);
  await event(old.id, proofreader.id, `${today}T06:00:00Z`, 3, 'COMMENTED');
  let p = (await service.myProgress(proofreader.id, cycle, today)).progress;
  check([p.target, p.carriedBacklog, p.submitted, p.remaining], [4, 2, 5, 1]);
  // 16:00 UTC belongs to the following Manila day, not today's total.
  await track(`${today}T16:00:00Z`);
  check((await service.myProgress(proofreader.id, cycle, today)).progress.submitted, 5);
  check((await service.myProgress(proofreader.id, cycle, shift(1))).progress.submitted, 1);
  const listing = await service.listTargets(manager.id, cycle, today, 1, 'Proofreader', '');
  check(listing.staff.find(s => s.id === proofreader.id).submitted, 5);
  const history = await service.targetHistory(manager.id, saved.saved[0].id, 1);
  check(history.total, 3);
  await assert.rejects(db.proofreadingTargetChange.update({ where: { id: history.changes[0].id }, data: { reason: 'overwrite' } }), /immutable/); passed++;
  await assert.rejects(db.proofreadingDailyTarget.update({ where: { id: saved.saved[0].id }, data: { target_count: -1 } }), /count_check/); passed++;
  await rejects(() => service.targetHistory(other.id, saved.saved[0].id, 1), 403);
  // Exercise real HTTP authentication, origin protection and validation.
  const app = require('../dist/server').default;
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/admin/targets`;
  const jwt = require('jsonwebtoken');
  const token = user => jwt.sign({ admin_id: user.id, role: user.role, is_admin: true }, process.env.JWT_SAUCE, { expiresIn: '5m' });
  const get = (path, user) => fetch(base + path, { headers: user ? { cookie: `token=${token(user)}` } : {} });
  check((await get(`?year=2026&term=END_YEAR`)).status, 401);
  check((await get(`?year=2026&term=END_YEAR`, proofreader)).status, 403);
  const own = await get(`/me?year=2026&term=END_YEAR&staffId=${other.id}`, proofreader);
  check((await own.json()).progress.staffId, proofreader.id);
  check((await get(`/me?year=2026&term=END_YEAR`, other)).status, 403);
  const put = (origin, body) => fetch(base, { method: 'PUT', headers: { origin, cookie: `token=${token(manager)}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  check((await put('https://untrusted.invalid', batch([entry(shift(3), 5)]))).status, 403);
  check((await put(process.env.FRONTEND_ORIGIN, batch([entry(shift(3), -1)]))).status, 400);
  const duplicate = batch([entry(shift(3), 5)]);
  check((await put(process.env.FRONTEND_ORIGIN, duplicate)).status, 200);
  check((await put(process.env.FRONTEND_ORIGIN, duplicate)).status, 200);
  check((await revokeAssignment(manager.id, a.id)).status, 200);
  check((await db.proofreadingDailyTarget.findUnique({ where: { id: saved.saved[1].id } })).target_count, 10);
  check((await revokeAssignment(manager.id, b.id)).status, 200);
  check((await db.proofreadingDailyTarget.findUnique({ where: { id: saved.saved[1].id } })).target_count, 0);
  check((await db.proofreadingDailyTarget.findUnique({ where: { id: saved.saved[0].id } })).target_count, 4);
  await rejects(() => service.myProgress(proofreader.id, cycle, today), 403);
  // One person can have all operational roles without mixing their goals or credit.
  const worker = await staff('MultiRole', 'MEMBER');
  const roles = ['INFORMATION_PROOFREADER', 'INFORMATION_QC', 'PHOTO_UPLOADER', 'PHOTO_QC'];
  const roleAssignments = {};
  for (const role of roles) {
    roleAssignments[role] = await db.reviewAssignment.create({ data: { admin_id: worker.id, granted_by: manager.id, capability: role } });
    await service.saveTargets(manager.id, { ...batch([entry(today, 8), entry(shift(1), 8)]), role,
      entries: [today, shift(1)].map(date => ({ staffId: worker.id, date, count: 8, expectedVersion: null })) });
    const list = await service.listTargets(manager.id, cycle, today, 1, 'MultiRole', '', role);
    check(list.staff.filter(s => s.id === worker.id).length, 1);
  }
  const finalAssignment = await db.reviewAssignment.findFirst({ where: { capability: 'FINAL_MODERATOR', revoked_at: null } });
  assert.ok(finalAssignment, 'The local demo moderator must exist');
  const finalId = finalAssignment.admin_id;
  const beforeFinal = (await service.myProgress(finalId, cycle, today, 'FINAL_MODERATOR')).progress.submitted;
  const info = await track(`${today}T07:00:00Z`, worker.id);
  async function decision(action, actor, version) {
    const op = await db.reviewOperation.create({ data: { actor_id: actor, client_key: randomUUID(), request_hash: 'b'.repeat(64) } });
    const revision = await db.reviewRevision.findFirst({ where: { track_id: info.id } });
    const from = action.includes('QC') ? 'SUBMITTED_QC' : 'SUBMITTED_MODERATOR';
    await db.informationReviewEvent.create({ data: { track_id: info.id, track_version: version, revision_id: revision.id,
      actor_id: actor, operation_id: op.id, action, from_stage: from, to_stage: action,
      note: action.startsWith('REJECTED') ? 'Fixture correction' : null, created_at: new Date(`${today}T08:00:00Z`) } });
  }
  await decision('REJECTED_QC', worker.id, 3);
  await decision('APPROVED_QC', worker.id, 4);
  await decision('REJECTED_MODERATOR', finalId, 5);
  await decision('LOCKED', finalId, 6);
  const student = await db.student.create({ data: { student_number: number++, personal_email: `${randomUUID()}@aurium.invalid`, grad_year: 2026, grad_term: 'END_YEAR' } });
  const photoCase = await db.reviewCase.create({ data: { student_id: student.id, grad_year: 2026, grad_term: 'END_YEAR', outcome: 'VERIFIED', checked_by: manager.id, source_version: 'isolated-target-test' } });
  const photoTrack = await db.reviewTrack.create({ data: { case_id: photoCase.id, type: 'PHOTOS' } });
  const assets = [];
  for (const type of ['GRADUATION', 'THEME']) {
    assets.push(await db.photoAsset.create({ data: { track_id: photoTrack.id, type, status: 'SEALED',
      staging_key: `local-target-test/${randomUUID()}`, final_key: `local-target-test/${randomUUID()}`,
      mime_type: 'image/jpeg', byte_size: 100, sha256: 'c'.repeat(64), uploaded_by: worker.id, sealed_at: new Date() } }));
  }
  const pair = await db.photoPairRevision.create({ data: { track_id: photoTrack.id, track_version: 2,
    graduation_asset_id: assets[0].id, theme_asset_id: assets[1].id, created_by: worker.id } });
  let version = 2;
  for (const action of ['SUBMITTED_QC', 'REJECTED_QC', 'SUBMITTED_QC', 'APPROVED_QC', 'REJECTED_MODERATOR', 'LOCKED']) {
    const actor = action === 'LOCKED' || action === 'REJECTED_MODERATOR' ? finalId : worker.id;
    const op = await db.reviewOperation.create({ data: { actor_id: actor, client_key: randomUUID(), request_hash: 'd'.repeat(64) } });
    await db.photoReviewEvent.create({ data: { track_id: photoTrack.id, track_version: version++, pair_id: pair.id,
      actor_id: actor, operation_id: op.id, action, from_stage: action === 'SUBMITTED_QC' ? 'DRAFT' : actor === finalId ? 'SUBMITTED_MODERATOR' : 'SUBMITTED_QC',
      to_stage: action, note: action.startsWith('REJECTED') ? 'Fixture correction' : null, created_at: new Date(`${today}T09:00:00Z`) } });
  }
  for (const role of roles) {
    const progress = (await service.myProgress(worker.id, cycle, today, role)).progress;
    check([progress.target, progress.submitted, progress.remaining], [8, 1, 7]);
  }
  check((await service.myProgress(finalId, cycle, today, 'FINAL_MODERATOR')).progress.submitted, beforeFinal + 2);
  await rejects(() => service.myProgress(worker.id, cycle, today, 'FINAL_MODERATOR'), 403);
  const moderatorList = await service.listTargets(manager.id, cycle, today, 1, '', '', 'FINAL_MODERATOR');
  check(moderatorList.staff.some(s => s.id === finalId), true);
  await revokeAssignment(manager.id, roleAssignments.PHOTO_QC.id);
  const future = await db.proofreadingDailyTarget.findMany({ where: { staff_id: worker.id, target_date: new Date(shift(1)) } });
  check(future.find(t => t.capability === 'PHOTO_QC').target_count, 0);
  check(future.filter(t => t.capability !== 'PHOTO_QC').every(t => t.target_count === 8), true);
  check(await db.student.findMany({ where: { id: { in: existingStudents.map(s => s.id) } }, orderBy: { id: 'asc' } }), existingStudents);
  console.log(`${passed} daily-target acceptance checks passed; existing graduate rows unchanged; isolated fixtures retained.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await db.$disconnect();
});
