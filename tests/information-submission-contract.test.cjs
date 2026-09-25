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

test('a returned review needs a correction newer than its rejection', () => {
  assert.equal(canSubmitInformation('DRAFT', 2, null), true);
  assert.equal(canSubmitInformation('REJECTED_QC', 6, 5), true);
  assert.equal(canSubmitInformation('REJECTED_MODERATOR', 9, 8), true);
  assert.equal(canSubmitInformation('REJECTED_QC', 5, 5), false);
  assert.equal(canSubmitInformation('REJECTED_MODERATOR', 7, null), false);
  assert.equal(canSubmitInformation('SUBMITTED_QC', 8, 5), false);
});
