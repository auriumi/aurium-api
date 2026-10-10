const test = require('node:test');
const assert = require('node:assert/strict');
const { readPhotoDecision, photoTransition, photoDecisionHash } =
  require('../dist/api/review/photo_decision_contract.js');

const base = {
  expectedVersion: 7, pairRevisionId: 33,
  operationId: '42434623-185c-496d-82c7-6de90a16649b',
};

test('photo decisions require the pair and a reason for rejection only', () => {
  assert.equal(readPhotoDecision({ ...base, decision: 'REJECT' }, 'qc'), null);
  assert.equal(readPhotoDecision({ ...base, decision: 'REJECT', reason: ' ' }, 'qc'), null);
  assert.equal(readPhotoDecision({ ...base, decision: 'REJECT', reason: 'Wrong graduate' }, 'qc').reason, 'Wrong graduate');
  assert.equal(readPhotoDecision({ ...base, decision: 'APPROVE', reason: 'Looks good' }, 'qc'), null);
  assert.equal(readPhotoDecision({ ...base, decision: 'FORWARD' }, 'moderator'), null);
  assert.equal(readPhotoDecision({ ...base, pairRevisionId: 0, decision: 'APPROVE' }, 'qc'), null);
});

test('photo stages allow only the intended QC and moderator decisions', () => {
  assert.deepEqual(photoTransition('qc', 'SUBMITTED_QC', 'APPROVE'),
    { action: 'APPROVED_QC', toStage: 'APPROVED_QC' });
  assert.deepEqual(photoTransition('qc', 'APPROVED_QC', 'FORWARD'),
    { action: 'SUBMITTED_MODERATOR', toStage: 'SUBMITTED_MODERATOR' });
  assert.deepEqual(photoTransition('moderator', 'SUBMITTED_MODERATOR', 'REJECT'),
    { action: 'REJECTED_MODERATOR', toStage: 'REJECTED_MODERATOR' });
  assert.equal(photoTransition('qc', 'REJECTED_MODERATOR', 'APPROVE'), null);
  assert.equal(photoTransition('moderator', 'APPROVED_QC', 'APPROVE'), null);
  const approve = readPhotoDecision({ ...base, decision: 'APPROVE' }, 'qc');
  const reject = readPhotoDecision({ ...base, decision: 'REJECT', reason: 'Wrong image' }, 'qc');
  assert.notEqual(photoDecisionHash(9, 'qc', approve), photoDecisionHash(9, 'qc', reject));
});
