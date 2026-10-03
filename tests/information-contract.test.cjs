const test = require('node:test');
const assert = require('node:assert/strict');
const { stagesForQueue, queueForStage } = require('../dist/api/review/information_contract.js');
const { graduateScopeWhere, graduateSearchWhere } = require('../dist/api/review/review_filters.js');

test('information queues separate QC approval from forwarding to the moderator', () => {
  assert.deepEqual(stagesForQueue('APPROVED_QC'), ['APPROVED_QC']);
  assert.deepEqual(stagesForQueue('SUBMITTED_MODERATOR'), ['SUBMITTED_MODERATOR']);
  assert.deepEqual(stagesForQueue('COMPLETED'), ['LOCKED']);
  assert.equal(queueForStage('SUBMITTED_MODERATOR'), 'SUBMITTED_MODERATOR');
  assert.equal(queueForStage('REJECTED_MODERATOR'), 'REJECTED_MODERATOR');
});

test('each review stage belongs to exactly one action queue', () => {
  const { ReviewStage } = require('@prisma/client');
  const { informationQueues } = require('../dist/api/review/information_contract.js');
  for (const stage of Object.values(ReviewStage)) {
    const containingQueues = informationQueues.filter(queue => queue !== 'ALL' && stagesForQueue(queue).includes(stage));
    assert.deepEqual(containingQueues, [queueForStage(stage)], stage);
  }
});

test('graduate search keeps multiple given-name terms and exact student numbers', () => {
  const search = graduateSearchWhere('Mary Ann Santos');
  assert.equal(search.AND.length, 3);
  assert.equal(search.AND[0].OR[0].first_name.contains, 'Mary');
  assert.equal(search.AND[1].OR[0].first_name.contains, 'Ann');
  assert.deepEqual(graduateSearchWhere('20260001'), { student_number: 20260001 });
});

test('academic scope query retains every assigned boundary', () => {
  assert.deepEqual(graduateScopeWhere([{ department: 'Teacher Education', course: 'BSED', major: 'English' }]), {
    OR: [{ department: 'Teacher Education', course: 'BSED', major: 'English' }],
  });
  assert.deepEqual(graduateScopeWhere([{ department: null, course: null, major: null }]), {});
});
