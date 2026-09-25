const test = require('node:test');
const assert = require('node:assert/strict');
const { readVerificationBatch, verificationRequestHash, canAdvanceVerification } = require('../dist/api/review/rac_contract.js');

const operationId = '2ee32fe4-537a-4540-b609-1bb6dd2d27da';
const batch = {
  year: 2026, term: 'END_YEAR', studentNumbers: [20260001, 20260002],
  outcome: 'VERIFIED', expectedVersions: { '20260001': null, '20260002': 1 },
  sourceVersion: 'RAC-final-2026-v1', operationId,
};

test('verification batch requires one expected version for each selected graduate', () => {
  assert.ok(readVerificationBatch(batch));
  assert.equal(readVerificationBatch({ ...batch, studentNumbers: [20260001, 20260001] }), null);
  assert.equal(readVerificationBatch({ ...batch, expectedVersions: { '20260001': null } }), null);
  assert.equal(readVerificationBatch({ ...batch, studentNumbers: [] }), null);
  assert.equal(readVerificationBatch({ ...batch, outcome: 'LOCKED' }), null);
  assert.equal(readVerificationBatch({ ...batch, sourceVersion: '' }), null);
});

test('retry fingerprint ignores selection order but includes outcome and versions', () => {
  const parsed = readVerificationBatch(batch);
  const reversed = readVerificationBatch({ ...batch, studentNumbers: [...batch.studentNumbers].reverse() });
  assert.equal(verificationRequestHash(parsed), verificationRequestHash(reversed));
  assert.notEqual(verificationRequestHash(parsed), verificationRequestHash({ ...parsed, outcome: 'NOT_LISTED' }));
  assert.notEqual(verificationRequestHash(parsed), verificationRequestHash({ ...parsed, expectedVersions: { ...parsed.expectedVersions, '20260002': 2 } }));
  assert.notEqual(verificationRequestHash(parsed), verificationRequestHash({ ...parsed, sourceVersion: 'RAC-final-2026-v2' }));
});

test('unchecked and not-listed records can advance, while verified or stale records cannot', () => {
  assert.equal(canAdvanceVerification(null, null, 'VERIFIED'), true);
  assert.equal(canAdvanceVerification(null, 1, 'VERIFIED'), false);
  assert.equal(canAdvanceVerification({ outcome: 'NOT_LISTED', version: 1 }, 1, 'VERIFIED'), true);
  assert.equal(canAdvanceVerification({ outcome: 'NOT_LISTED', version: 1 }, 1, 'NOT_LISTED'), false);
  assert.equal(canAdvanceVerification({ outcome: 'VERIFIED', version: 1 }, 1, 'NOT_LISTED'), false);
  assert.equal(canAdvanceVerification({ outcome: 'NOT_LISTED', version: 2 }, 1, 'VERIFIED'), false);
});
