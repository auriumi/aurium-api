const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { manilaDate, validDate, readTargetBatch, targetHash, progressForDate } = require('../dist/api/review/targets/target_contract');
const valid = () => ({ year: 2026, term: 'END_YEAR', operationId: randomUUID(), reason: '',
  entries: [{ staffId: 1, date: '2026-10-26', count: 20, expectedVersion: null }] });
test('Manila midnight and real calendar dates', () => {
  assert.equal(manilaDate(new Date('2026-10-25T15:59:59Z')), '2026-10-25');
  assert.equal(manilaDate(new Date('2026-10-25T16:00:00Z')), '2026-10-26');
  assert.equal(validDate('2026-02-29'), false); assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('2026-13-01'), false);
});

test('each workflow role has distinct target identity; unsupported roles are rejected', () => {
  const roles = ['INFORMATION_PROOFREADER', 'INFORMATION_QC', 'PHOTO_UPLOADER', 'PHOTO_QC', 'FINAL_MODERATOR'];
  const hashes = roles.map(role => {
    const parsed = readTargetBatch({ ...valid(), role });
    assert.equal(parsed.role, role);
    return targetHash(parsed);
  });
  assert.equal(new Set(hashes).size, 5);
  for (const role of ['ADMINISTRATOR', 'RAC_CHECK', 'IT_CORRECTION', 'unknown', [], '']) {
    assert.equal(readTargetBatch({ ...valid(), role }), null);
  }
});
test('targets validate strict whole numbers, bounds, versions and unique entries', () => {
  assert.ok(readTargetBatch(valid()));
  for (const count of [-1, 1.5, '20', 10001, null]) {
    const b = valid(); b.entries[0].count = count; assert.equal(readTargetBatch(b), null);
  }
  for (const expectedVersion of [undefined, 0, -1, '1']) {
    const b = valid(); b.entries[0].expectedVersion = expectedVersion; assert.equal(readTargetBatch(b), null);
  }
  const b = valid(); b.entries.push(b.entries[0]); assert.equal(readTargetBatch(b), null);
  assert.equal(readTargetBatch({ ...valid(), submitted: 999 }), null);
  assert.equal(readTargetBatch({ ...valid(), operationId: 'invalid' }), null);
  assert.equal(readTargetBatch({ ...valid(), entries: [] }), null);
});
test('batch fingerprint is stable across entry order and changes when target or reason changes', () => {
  const b = valid(); b.entries.push({ ...b.entries[0], staffId: 2 });
  assert.equal(targetHash(readTargetBatch(b)), targetHash(readTargetBatch({ ...b, entries: [...b.entries].reverse() })));
  assert.notEqual(targetHash(readTargetBatch(b)), targetHash(readTargetBatch({ ...b, reason: 'Changed workload' })));
});
const row = (date, count) => ({ date, count });
test('three-day carryover clears oldest shortfall and does not prepay future dates', () => {
  const targets = [row('2026-10-26', 20), row('2026-10-27', 30), row('2026-10-28', 20), row('2026-10-29', 20)];
  const submissions = [row('2026-10-26', 15), row('2026-10-27', 32), row('2026-10-28', 25)];
  const tuesday = progressForDate(targets, submissions, '2026-10-27');
  assert.equal(tuesday.carriedBacklog, 5); assert.equal(tuesday.remaining, 3);
  assert.equal(progressForDate(targets, submissions, '2026-10-28').remaining, 0);
  assert.equal(progressForDate(targets, submissions, '2026-10-29').remaining, 20);
});
test('no target adds no debt; unscheduled work can clear existing debt', () => {
  assert.deepEqual(progressForDate([], [row('2026-10-26', 30)], '2026-10-26'), {
    date: '2026-10-26', startDate: null, target: null, carriedBacklog: 0, submitted: 30, remaining: 0,
  });
  const p = progressForDate([row('2026-10-26', 20)], [row('2026-10-27', 5)], '2026-10-27');
  assert.equal(p.target, null); assert.equal(p.carriedBacklog, 20); assert.equal(p.remaining, 15);
});
test('pre-target work cannot offset targets; lowering today recalculates without losing credit', () => {
  const targets = [row('2026-10-26', 10)];
  const work = [row('2026-10-25', 100), row('2026-10-26', 15)];
  assert.equal(progressForDate(targets, work, '2026-10-26').submitted, 15);
  assert.equal(progressForDate(targets, work, '2026-10-26').remaining, 0);
  assert.equal(progressForDate(targets, work, '2026-10-25').target, null);
});
test('backlog crosses month boundaries and handles explicit zero targets', () => {
  const p = progressForDate([row('2026-09-30', 10), row('2026-10-01', 0)], [row('2026-09-30', 2)], '2026-10-01');
  assert.equal(p.carriedBacklog, 8); assert.equal(p.target, 0); assert.equal(p.remaining, 8);
});
