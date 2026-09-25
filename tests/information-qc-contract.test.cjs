const test = require('node:test');
const assert = require('node:assert/strict');
const { readInformationQcRequest, qcTransition, qcRequestHash } =
  require('../dist/api/review/information_qc_contract.js');

const base = {
  expectedVersion: 6, revisionId: 31,
  operationId: '42434623-185c-496d-82c7-6de90a16649b',
};

test('QC rejection requires a nonempty bounded reason; approval and forwarding do not accept one', () => {
  assert.equal(readInformationQcRequest({ ...base, decision: 'REJECT' }), null);
  assert.equal(readInformationQcRequest({ ...base, decision: 'REJECT', reason: '  ' }), null);
  assert.equal(readInformationQcRequest({ ...base, decision: 'REJECT', reason: 'Missing middle name' }).reason, 'Missing middle name');
  assert.equal(readInformationQcRequest({ ...base, decision: 'APPROVE', reason: 'Looks good' }), null);
  assert.equal(readInformationQcRequest({ ...base, decision: 'APPROVE' }).reason, null);
  assert.equal(readInformationQcRequest({ ...base, decision: 'FORWARD' }).decision, 'FORWARD');
  assert.equal(readInformationQcRequest({ ...base, decision: 'EDIT' }), null);
});

test('only the assigned QC stage action can advance, and the decision is in the retry fingerprint', () => {
  assert.deepEqual(qcTransition('SUBMITTED_QC', 'APPROVE'), { action: 'APPROVED_QC', toStage: 'APPROVED_QC' });
  assert.deepEqual(qcTransition('SUBMITTED_QC', 'REJECT'), { action: 'REJECTED_QC', toStage: 'REJECTED_QC' });
  assert.deepEqual(qcTransition('APPROVED_QC', 'FORWARD'), { action: 'SUBMITTED_MODERATOR', toStage: 'SUBMITTED_MODERATOR' });
  assert.equal(qcTransition('REJECTED_QC', 'APPROVE'), null);
  assert.equal(qcTransition('SUBMITTED_QC', 'FORWARD'), null);
  const approve = readInformationQcRequest({ ...base, decision: 'APPROVE' });
  const reject = readInformationQcRequest({ ...base, decision: 'REJECT', reason: 'Wrong program' });
  assert.notEqual(qcRequestHash(9, approve), qcRequestHash(9, reject));
});
