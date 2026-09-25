const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesGraduateScope, readReviewScope } = require('../dist/api/review/review_scope.js');

test('review scope denies graduates outside the exact assignment', () => {
  const assignment = readReviewScope({ department: 'Computing Education', course: 'BS Computer Science' });
  assert.ok(assignment);
  assert.equal(matchesGraduateScope(assignment, { department: 'Computing Education', course: 'BS Computer Science', major: null }), true);
  assert.equal(matchesGraduateScope(assignment, { department: 'Computing Education', course: 'BS Information Technology', major: null }), false);
  assert.equal(matchesGraduateScope(assignment, { department: 'Teacher Education', course: 'BS Computer Science', major: null }), false);
});

test('invalid or ambiguous academic scopes are rejected', () => {
  assert.equal(readReviewScope({ course: 'BS Computer Science' }), null);
  assert.equal(readReviewScope({ department: 'Computing Education', major: 'AI' }), null);
  assert.equal(readReviewScope({ department: ' ' }), null);
  assert.equal(readReviewScope({ department: 'Computing Education', unexpected: 'value' }), null);
  assert.deepEqual(readReviewScope({}), { department: null, course: null, major: null });
});
