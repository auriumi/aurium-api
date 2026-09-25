const test = require('node:test');
const assert = require('node:assert/strict');
const { readDraftSave, applyDraftChanges, profileHash, draftRequestHash, editableProfileFields } =
  require('../dist/api/review/information_draft_contract.js');

const operationId = '56add650-3040-41e9-92e6-450442960aa4';
const save = changes => ({ expectedVersion: 1, operationId, changes });

test('draft input rejects email, identity, unknown and malformed values', () => {
  for (const changes of [
    { personalEmail: 'different@example.com' }, { studentNumber: 22 },
    { firstName: null }, { firstName: '  Ana' }, { birthDate: '2026-02-30' },
    { firstName: 'Ana\nBad' },
  ]) assert.equal(readDraftSave(save(changes)), null);
  assert.equal(readDraftSave({ ...save({ firstName: 'Ana' }), extra: true }), null);
  assert.equal(readDraftSave(save({})), null);
});

test('a valid draft applies only requested fields and detects unchanged saves', () => {
  const before = Object.fromEntries(editableProfileFields.map(field => [field, null]));
  before.firstName = 'Ana';
  const draft = readDraftSave(save({ firstName: 'Andrea', nickname: null }));
  assert.ok(draft);
  const { after, changedFields } = applyDraftChanges(before, draft.changes);
  assert.deepEqual(changedFields, ['firstName']);
  assert.equal(after.firstName, 'Andrea');
  assert.equal(before.firstName, 'Ana');
  assert.deepEqual(applyDraftChanges(before, { firstName: 'Ana' }).changedFields, []);
});

test('retry fingerprint is stable across change-key order and tied to review/version', () => {
  const a = readDraftSave(save({ firstName: 'Andrea', nickname: 'Andi' }));
  const b = readDraftSave(save({ nickname: 'Andi', firstName: 'Andrea' }));
  assert.equal(draftRequestHash(7, a), draftRequestHash(7, b));
  assert.notEqual(draftRequestHash(7, a), draftRequestHash(8, a));
  assert.notEqual(draftRequestHash(7, a), draftRequestHash(7, { ...a, expectedVersion: 2 }));
  const canonical = Object.fromEntries(editableProfileFields.map(field => [field, null]));
  assert.notEqual(profileHash(canonical), profileHash({ ...canonical, firstName: 'Andrea' }));
});
