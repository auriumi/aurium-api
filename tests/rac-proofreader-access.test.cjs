const test = require('node:test');
const assert = require('node:assert/strict');

// The service must derive RAC access from current proofreader scopes, not a JWT
// role or the retired RAC_CHECK designation. These tests never connect to a DB.
let assignments = [];
let account = { id: 1, role: 'MEMBER' };
let lastWhere;
const db = {
  $transaction: async action => action(db),
  admin: { findUnique: async () => account },
  reviewAssignment: { findMany: async ({ where }) => assignments.filter(a =>
    a.admin_id === where.admin_id && a.capability === where.capability && a.revoked_at === where.revoked_at) },
  student: {
    findMany: async ({ where }) => { lastWhere = where; return []; },
    count: async () => 0,
    findUnique: async () => ({ id: 10, department: 'Other', course: 'Other', major: null, grad_year: 2026, grad_term: 'END_YEAR' }),
  },
};
const dbPath = require.resolve('../dist/config/prisma.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { __esModule: true, default: db } };
const service = require('../dist/api/review/rac_service.js');
const query = { year: 2026, term: 'END_YEAR', page: 1, status: 'ALL', department: null, course: null, major: null, search: '' };
const assignment = capability => ({ admin_id: 1, capability, revoked_at: null, department: 'DAE', course: 'BSIT', major: null });

test('RAC access follows the proofreader assignment and its scope', async () => {
  assignments = [assignment('INFORMATION_PROOFREADER')];
  assert.equal((await service.listVerificationGraduates(1, query)).success, true);
  assert.match(JSON.stringify(lastWhere), /DAE/);
  assert.match(JSON.stringify(lastWhere), /BSIT/);
  await assert.rejects(service.verificationHistory(1, 10, query), error => error.status === 404);
});

test('retired RAC-only and QC assignments cannot read or confirm RAC records', async () => {
  process.env.RAC_SOURCE_VERSION = 'test-list';
  for (const capability of ['RAC_CHECK', 'INFORMATION_QC', 'PHOTO_UPLOADER']) {
    assignments = [assignment(capability)];
    await assert.rejects(service.listVerificationGraduates(1, query), error => error.status === 403);
    await assert.rejects(service.verificationFilterOptions(1, query, null, null), error => error.status === 403);
    await assert.rejects(service.verifyGraduateBatch(1, { ...query, sourceVersion: 'test-list',
      studentNumbers: [10], expectedVersions: { 10: null }, outcome: 'VERIFIED',
      operationId: '00000000-0000-4000-8000-000000000001' }), error => error.status === 403);
  }
});

test('revocation or account removal takes effect on the next RAC request', async () => {
  assignments = [{ ...assignment('INFORMATION_PROOFREADER'), revoked_at: new Date() }];
  await assert.rejects(service.listVerificationGraduates(1, query), error => error.status === 403);
  assignments = [assignment('INFORMATION_PROOFREADER')];
  account = null;
  await assert.rejects(service.listVerificationGraduates(1, query), error => error.status === 403);
});
