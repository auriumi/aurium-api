const test = require('node:test');
const assert = require('node:assert/strict');
let role = 'MEMBER';
let review = null;
let cycle;
const student = { id: 11, student_number: 20260001, grad_year: 2026, grad_term: 'END_YEAR', first_name: 'Approved name',
  studentDetail: { photo_url: 'reference-key', city: 'Test city' }, studentAuth: { status: 'FULLY_VERIFIED' } };
const db = { $transaction: async action => action(db),
  admin: { findUnique: async () => role ? { role } : null },
  student: { findUnique: async args => { assert.deepEqual(args.include.studentAuth, { select: { status: true } }); return student; } },
  reviewCase: { findUnique: async args => { cycle = args.where; assert.equal(args.select.tracks.select.photoEvents.where.action, 'LOCKED');
    assert.equal(args.select.tracks.select.photoEvents.take, 1); return review; } },
};
function mock(path, exports) { const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports }; }
mock('../dist/config/prisma.js', { __esModule: true, default: db });
mock('../dist/api/student/r2_service.js', { generateReadUrl: async key => `signed:${key}` });
mock('../dist/api/review/photo_storage.js', { signedPhotoRead: async key => `signed:${key}` });
const { masterlistDetail } = require('../dist/api/admin/masterlist_detail_service.js');
const approved = () => ({ outcome: 'VERIFIED', tracks: [{ type: 'PHOTOS', stage: 'LOCKED', informationEvents: [],
  photoEvents: [{ created_at: '2026-10-08', pair: {
    graduationAsset: { status: 'SEALED', type: 'GRADUATION', final_key: 'approved-grad' },
    themeAsset: { status: 'SEALED', type: 'THEME', final_key: 'approved-theme' },
  } }] }] });

test('ordinary masterlist staff see live information and no unapproved photos', async () => {
  const result = await masterlistDetail(1, student.student_number);
  assert.equal(result.student.first_name, 'Approved name');
  assert.equal(result.student.photo_grad, null);
  assert.equal(result.student.review.photos.status, 'AWAITING_APPROVAL');
  assert.deepEqual(cycle.student_id_grad_year_grad_term, { student_id: 11, grad_year: 2026, grad_term: 'END_YEAR' });
  assert.equal(result.student.studentDetail.photo_url, 'signed:reference-key');
});
test('approved pair stays published during reopening and replaces only on the next approval', async () => {
  review = approved();
  let result = await masterlistDetail(1, student.student_number);
  assert.equal(result.student.photo_grad, 'signed:approved-grad');
  review.tracks[0].stage = 'DRAFT';
  result = await masterlistDetail(1, student.student_number);
  assert.equal(result.student.photo_grad, 'signed:approved-grad');
  assert.equal(result.student.review.photos.correctionInProgress, true);
  review.tracks[0].photoEvents[0].pair.graduationAsset.final_key = 'replacement-approved';
  review.tracks[0].stage = 'LOCKED';
  result = await masterlistDetail(1, student.student_number);
  assert.equal(result.student.photo_grad, 'signed:replacement-approved');
  assert.equal(JSON.stringify(result).includes('final_key'), false);
});
test('unsealed pair and unverified case fail closed', async () => {
  review = approved(); review.tracks[0].photoEvents[0].pair.themeAsset.status = 'STAGED';
  assert.equal((await masterlistDetail(1, student.student_number)).student.photo_grad, null);
  review = approved(); review.outcome = 'NOT_LISTED';
  assert.equal((await masterlistDetail(1, student.student_number)).student.photo_grad, null);
});
test('removed staff account cannot read graduate details', async () => {
  role = null;
  await assert.rejects(masterlistDetail(1, student.student_number), error => error.status === 403);
});
