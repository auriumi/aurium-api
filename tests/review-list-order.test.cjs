const test = require('node:test');
const assert = require('node:assert/strict');

let studentQuery;
const rows = [{ student_number: 20260001, first_name: 'Zoe', last_name: 'Abad',
  mid_name: null, suffix: null, department: 'DAE', course: 'BSIT', major: null,
  reviewCases: [{ outcome: 'NOT_LISTED', version: 1, checked_at: null, source_version: 'RAC-2026-original', tracks: [] }] }];
const db = {
  admin: { findUnique: async () => ({ id: 1, role: 'MEMBER' }) },
  reviewAssignment: { findMany: async () => [{ capability: 'INFORMATION_PROOFREADER', department: 'DAE', course: null, major: null }] },
  student: {
    findMany: async args => { studentQuery = args; return rows; },
    count: async () => 51,
  },
  reviewTrack: { groupBy: async () => [] },
};
function mock(path, exports) { const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports }; }
mock('../dist/config/prisma.js', { __esModule: true, default: db });
mock('../dist/api/student/r2_service.js', {});
mock('../dist/api/review/photos/photo_storage.js', {});
const { listVerificationGraduates } = require('../dist/api/review/rac/rac_service.js');
const { listInformationReviews } = require('../dist/api/review/information/information_service.js');
const { listPhotoReviews } = require('../dist/api/review/photos/photo_service.js');
const cycle = { year: 2026, term: 'END_YEAR' };
const query = { ...cycle, page: 2, status: 'ALL', queue: 'ALL', department: null, course: null, major: null, search: '' };

test('RAC, information and photo lists order by surname before database pagination, with stable ties', async () => {
  for (const list of [() => listVerificationGraduates(1, query), () => listInformationReviews(1, query),
    () => listPhotoReviews(1, cycle, 2, '', null, null, null, 'ALL')]) {
    const result = await list();
    assert.deepEqual(studentQuery.orderBy, [{ last_name: 'asc' }, { first_name: 'asc' }, { student_number: 'asc' }]);
    assert.equal(studentQuery.skip, 25);
    assert.equal(studentQuery.take, 25);
    assert.equal(result.page, 2);
    assert.equal(result.total, 51);
    assert.match(JSON.stringify(studentQuery.where), /DAE/);
    assert.match(JSON.stringify(studentQuery.where), /2026/);
  }
});

test('RAC list supplies a manual marker for deployed clients while retaining prior row provenance', async () => {
  delete process.env.RAC_SOURCE_VERSION;
  let result = await listVerificationGraduates(1, query);
  assert.equal(result.sourceVersion, 'Manual verification');
  assert.equal(result.rows[0].sourceVersion, 'RAC-2026-original');
  process.env.RAC_SOURCE_VERSION = 'obsolete-configured-label';
  result = await listVerificationGraduates(1, query);
  assert.equal(result.sourceVersion, 'Manual verification');
  delete process.env.RAC_SOURCE_VERSION;
});
