const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
let roles, assignments;
function reset() {
  roles = { 1: 'MODERATOR', 2: 'MEMBER' };
  assignments = [{ id: 1, admin_id: 1, capability: 'FINAL_MODERATOR', revoked_at: null }];
}
const matches = (item, where) => Object.entries(where).every(([key, value]) => item[key] === value);
const db = {
  $transaction: async callback => callback(db), $queryRaw: async () => [],
  admin: {
    findUnique: async ({ where }) => roles[where.id] ? { id: where.id, role: roles[where.id] } : null,
    count: async () => 2,
    findMany: async ({ select, take }) => { assert.equal(take, 25); assert.equal(select.hashed_password, undefined); return []; },
  },
  reviewAssignment: {
    findFirst: async ({ where }) => assignments.find(item => matches(item, where)) || null,
    create: async ({ data }) => {
      if (assignments.some(item => matches(item, { admin_id: data.admin_id, capability: data.capability,
        department: data.department, course: data.course, major: data.major, revoked_at: null }))) {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });
      }
      const item = { id: assignments.length + 1, ...data, revoked_at: null }; assignments.push(item); return item;
    },
    update: async ({ where, data }) => Object.assign(assignments.find(item => item.id === where.id), data),
  },
};
const path = require.resolve('../dist/config/prisma.js');
require.cache[path] = { id: path, filename: path, loaded: true, exports: { __esModule: true, default: db } };
const { grantAssignment, revokeAssignment, listReviewStaff } = require('../dist/api/review/staff_assignment_service.js');
const input = capability => ({ adminId: 2, capability, scope: { department: 'DAE', course: 'BSIT', major: null } });

test('designated moderator grants and revokes operational assignments with history', async () => {
  reset();
  const result = await grantAssignment(1, input('INFORMATION_PROOFREADER'));
  assert.equal(result.status, 201); assert.equal(result.assignment.granted_by, 1);
  assert.equal((await grantAssignment(1, input('INFORMATION_PROOFREADER'))).status, 409);
  assert.equal((await revokeAssignment(1, result.assignment.id)).status, 200);
  assert.equal(assignments.length, 2); assert.equal(assignments[1].revoked_by, 1);
  assert.ok(assignments[1].revoked_at instanceof Date);
  assert.equal((await listReviewStaff(1, '', 1)).assignableCapabilities.includes('RAC_CHECK'), false);
});
test('moderator cannot grant or revoke high-privilege assignments or manage broad roles', async () => {
  reset();
  for (const capability of ['IT_CORRECTION', 'FINAL_MODERATOR']) {
    assert.equal((await grantAssignment(1, { ...input(capability), scope: {} })).status, 403);
  }
  assert.equal((await revokeAssignment(1, 1)).status, 403);
  assert.equal((await grantAssignment(1, { ...input('PHOTO_QC'), role: 'ADMINISTRATOR' })).status, 400);
});
test('revoked designation, demotion and missing account deny access on the next request', async () => {
  for (const change of [() => { assignments[0].revoked_at = new Date(); }, () => { roles[1] = 'MEMBER'; }, () => { delete roles[1]; }]) {
    reset(); change();
    assert.equal((await grantAssignment(1, input('PHOTO_QC'))).status, 403);
    assert.equal((await revokeAssignment(1, 1)).status, 403);
    await assert.rejects(listReviewStaff(1, '', 1), error => error.status === 403);
  }
});
test('administrator retains special authority but cannot create retired RAC or duplicate moderators', async () => {
  reset(); roles[1] = 'ADMINISTRATOR';
  assert.equal((await grantAssignment(1, input('RAC_CHECK'))).status, 400);
  assert.equal((await grantAssignment(1, input('IT_CORRECTION'))).status, 201);
  roles[2] = 'MODERATOR';
  assert.equal((await grantAssignment(1, { ...input('FINAL_MODERATOR'), scope: {} })).status, 409);
});
test('missing, malformed and contradictory scopes are rejected', async () => {
  reset();
  for (const scope of [undefined, { course: 'BSIT' }, { department: [] }, { department: 'DAE', extra: true }]) {
    assert.equal((await grantAssignment(1, { ...input('PHOTO_QC'), scope })).status, 400);
  }
});
