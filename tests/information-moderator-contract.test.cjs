const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readInformationModeratorRequest, moderatorTransition, moderatorRequestHash,
  publicationChanges, publishableProfile,
} = require('../dist/api/review/information_moderator_contract.js');

const request = {
  expectedVersion: 8, revisionId: 31,
  operationId: '42434623-185c-496d-82c7-6de90a16649b',
};

test('moderator returns require a bounded reason and only forwarded work can be decided', () => {
  assert.equal(readInformationModeratorRequest({ ...request, decision: 'REJECT' }), null);
  assert.equal(readInformationModeratorRequest({ ...request, decision: 'REJECT', reason: '  ' }), null);
  assert.equal(readInformationModeratorRequest({ ...request, decision: 'REJECT', reason: 'Missing source' }).reason, 'Missing source');
  assert.equal(readInformationModeratorRequest({ ...request, decision: 'APPROVE', reason: 'Comment' }), null);
  assert.equal(readInformationModeratorRequest({ ...request, decision: 'APPROVE' }).reason, null);
  assert.deepEqual(moderatorTransition('SUBMITTED_MODERATOR', 'REJECT'), {
    action: 'REJECTED_MODERATOR', toStage: 'REJECTED_MODERATOR',
  });
  assert.deepEqual(moderatorTransition('SUBMITTED_MODERATOR', 'APPROVE'), {
    action: 'LOCKED', toStage: 'LOCKED',
  });
  assert.equal(moderatorTransition('APPROVED_QC', 'APPROVE'), null);
  assert.notEqual(moderatorRequestHash(9, readInformationModeratorRequest({ ...request, decision: 'APPROVE' })),
    moderatorRequestHash(9, readInformationModeratorRequest({ ...request, decision: 'REJECT', reason: 'Wrong name' })));
});

const baseline = {
  firstName: 'Alex', middleName: null, lastName: 'Santos', suffix: null,
  nickname: null, birthDate: '2002-01-02', department: 'Arts', program: 'BA',
  major: null, thesisTitle: null, contactNumber: null, province: null,
  city: null, barangay: null, mothersName: null, mothersTitle: null,
  fathersName: null, fathersTitle: null, guardiansName: null, guardiansTitle: null,
};

test('publication maps only reviewed fields and rejects invalid snapshots', () => {
  const approved = { ...baseline, firstName: 'Alexandra', birthDate: '2002-01-03',
    program: 'BS', mothersName: 'Maria Santos' };
  assert.equal(publishableProfile(approved), true);
  const changes = publicationChanges(baseline, approved);
  assert.deepEqual(changes.student, { first_name: 'Alexandra', course: 'BS' });
  assert.deepEqual(changes.detail, {
    birth_date: new Date('2002-01-03T00:00:00.000Z'), mothers_name: 'Maria Santos',
  });
  assert.equal(publishableProfile({ ...approved, birthDate: '2002-02-30' }), false);
  assert.equal(publishableProfile({ ...approved, firstName: null }), false);
  assert.equal(publishableProfile({ ...approved, firstName: 'A'.repeat(121) }), false);
});
