const test = require('node:test');
const assert = require('node:assert/strict');
const { readInformationSubmission, canSubmitInformation, submissionHash } =
  require('../dist/api/review/information_submission_contract.js');

const input = { expectedVersion: 5, revisionId: 31, operationId: 'e8382d0f-30d0-433b-996a-581dfcb42601' };

test('submission requires an exact revision, version and retry key', () => {
  assert.deepEqual(readInformationSubmission(input), input);
  assert.equal(readInformationSubmission({ ...input, revisionId: 0 }), null);
  assert.equal(readInformationSubmission({ ...input, expectedVersion: 5.5 }), null);
  assert.equal(readInformationSubmission({ ...input, note: 'unexpected' }), null);
  assert.equal(readInformationSubmission({ ...input, operationId: 'retry' }), null);
  assert.notEqual(submissionHash(7, input), submissionHash(8, input));
});

test('rechecked returns can be resubmitted without skipping QC or moderator review', () => {
  for (const stage of ['DRAFT', 'REJECTED_QC', 'REJECTED_MODERATOR']) {
    assert.equal(canSubmitInformation(stage), true);
  }
  for (const stage of ['SUBMITTED_QC', 'APPROVED_QC', 'SUBMITTED_MODERATOR', 'LOCKED']) {
    assert.equal(canSubmitInformation(stage), false);
  }
});