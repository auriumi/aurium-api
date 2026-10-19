const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { readVerificationBatch, verificationRequestHash, MANUAL_VERIFICATION_SOURCE } = require('../dist/api/review/rac/rac_contract.js');

// Exercise the real service, replacing only its database boundary. The transaction
// double rolls back writes so a later invalid item must not partially verify a batch.
let state;
let assignments;
const students = [1, 2].map(id => ({ id, student_number: 20260000 + id,
  department: 'DAE', course: 'BSIT', major: null, grad_year: 2026, grad_term: 'END_YEAR' }));
const db = {
  $transaction: async action => {
    const before = structuredClone(state);
    try { return await action(db); } catch (error) { state = before; throw error; }
  },
  $queryRaw: async () => [],
  admin: { findUnique: async () => ({ id: 1, role: 'MEMBER' }) },
  reviewAssignment: { findMany: async ({ where }) => assignments.filter(item => item.capability === where.capability) },
  student: { findMany: async ({ where }) => students.filter(student =>
    where.student_number.in.includes(student.student_number) && student.grad_year === where.grad_year && student.grad_term === where.grad_term) },
  reviewOperation: {
    create: async ({ data }) => {
      if (state.operations.some(item => item.actor_id === data.actor_id && item.client_key === data.client_key)) {
        throw new Prisma.PrismaClientKnownRequestError('Duplicate operation', { code: 'P2002', clientVersion: 'test' });
      }
      const operation = { id: state.operations.length + 1, ...data };
      state.operations.push(operation);
      return operation;
    },
    update: async ({ where, data }) => Object.assign(state.operations.find(item => item.id === where.id), data),
    findUnique: async ({ where }) => state.operations.find(item => item.actor_id === where.actor_id_client_key.actor_id &&
      item.client_key === where.actor_id_client_key.client_key) ?? null,
  },
  reviewCase: {
    // Prisma reads return snapshots; later writes must not mutate a prior read.
    findMany: async ({ where }) => structuredClone(state.cases.filter(item => where.student_id.in.includes(item.student_id) &&
      item.grad_year === where.grad_year && item.grad_term === where.grad_term)),
    create: async ({ data }) => {
      const reviewCase = { id: state.cases.length + 1, version: 1, ...data };
      state.cases.push(reviewCase);
      return reviewCase;
    },
    updateMany: async ({ where, data }) => {
      const existing = state.cases.find(item => item.id === where.id && item.version === where.version && item.outcome === where.outcome);
      if (!existing) return { count: 0 };
      Object.assign(existing, data, { version: existing.version + data.version.increment });
      return { count: 1 };
    },
  },
  reviewTrack: { createMany: async ({ data }) => { state.tracks.push(...data); } },
  reviewEvent: { create: async ({ data }) => { state.events.push(data); } },
};
const dbPath = require.resolve('../dist/config/prisma.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { __esModule: true, default: db } };
const { verifyGraduateBatch } = require('../dist/api/review/rac/rac_service.js');
const input = (overrides = {}) => readVerificationBatch({ year: 2026, term: 'END_YEAR',
  studentNumbers: [20260001, 20260002], expectedVersions: { 20260001: null, 20260002: null },
  outcome: 'VERIFIED', operationId: '00000000-0000-4000-8000-000000000001', ...overrides });

beforeEach(() => {
  state = { cases: [], tracks: [], events: [], operations: [] };
  assignments = [{ capability: 'INFORMATION_PROOFREADER', department: 'DAE', course: 'BSIT', major: null }];
  delete process.env.RAC_SOURCE_VERSION;
});

test('manual bulk verification needs no configured source and opens both tracks per graduate', async () => {
  const result = await verifyGraduateBatch(1, input());
  assert.equal(result.results.length, 2);
  assert.deepEqual(state.tracks, [{ case_id: 1, type: 'INFORMATION' }, { case_id: 1, type: 'PHOTOS' },
    { case_id: 2, type: 'INFORMATION' }, { case_id: 2, type: 'PHOTOS' }]);
  for (const reviewCase of state.cases) {
    assert.equal(reviewCase.source_version, MANUAL_VERIFICATION_SOURCE);
    assert.equal(reviewCase.checked_by, 1);
    assert.equal(reviewCase.grad_year, 2026);
    assert.equal(reviewCase.grad_term, 'END_YEAR');
  }
  assert.ok(state.events.every(event => event.source_version === MANUAL_VERIFICATION_SOURCE &&
    event.action === 'RAC_VERIFIED' && event.actor_id === 1));
});

test('older client labels remain accepted but cannot invent provenance for a new manual check', async () => {
  process.env.RAC_SOURCE_VERSION = 'old-configured-label';
  await verifyGraduateBatch(1, input({ sourceVersion: 'old-client-label' }));
  assert.ok(state.cases.every(item => item.source_version === MANUAL_VERIFICATION_SOURCE));
  assert.ok(state.events.every(item => item.source_version === MANUAL_VERIFICATION_SOURCE));
});

test('not on list retains a case without tracks and can later be confirmed without rewriting history', async () => {
  const single = { studentNumbers: [20260001], expectedVersions: { 20260001: null } };
  await verifyGraduateBatch(1, input({ ...single, outcome: 'NOT_LISTED' }));
  assert.equal(state.cases.length, 1);
  assert.equal(state.tracks.length, 0);
  // Existing official-list labels from before this release remain readable history.
  state.cases[0].source_version = 'RAC-2026-original';
  state.events[0].source_version = 'RAC-2026-original';
  await verifyGraduateBatch(1, input({ ...single, expectedVersions: { 20260001: 1 },
    operationId: '00000000-0000-4000-8000-000000000002' }));
  assert.equal(state.cases[0].version, 2);
  assert.equal(state.cases[0].source_version, MANUAL_VERIFICATION_SOURCE);
  assert.equal(state.events[0].source_version, 'RAC-2026-original');
  assert.equal(state.events[1].previous_outcome, 'NOT_LISTED');
  assert.equal(state.tracks.length, 2);
});

test('stale or already-verified items roll back the entire batch', async () => {
  for (const prior of [{ outcome: 'NOT_LISTED', version: 2 }, { outcome: 'VERIFIED', version: 1 }]) {
    state.cases = [{ id: 1, student_id: 2, grad_year: 2026, grad_term: 'END_YEAR', ...prior }];
    const before = structuredClone(state);
    await assert.rejects(verifyGraduateBatch(1, input({ expectedVersions: { 20260001: null, 20260002: 1 } })),
      error => error.status === 409 && error.code === 'STALE_VERIFICATION');
    assert.deepEqual(state, before);
  }
});

test('wrong capability, academic scope, cycle, or missing students cannot create verification data', async () => {
  for (const capability of ['RAC_CHECK', 'INFORMATION_QC', 'PHOTO_UPLOADER']) {
    assignments[0].capability = capability;
    await assert.rejects(verifyGraduateBatch(1, input()), error => error.status === 403);
  }
  assignments[0].capability = 'INFORMATION_PROOFREADER';
  assignments[0].department = 'Other';
  await assert.rejects(verifyGraduateBatch(1, input()), error => error.status === 404);
  assignments[0].department = 'DAE';
  await assert.rejects(verifyGraduateBatch(1, input({ year: 2025 })), error => error.status === 404);
  await assert.rejects(verifyGraduateBatch(1, input({ studentNumbers: [20269999], expectedVersions: { 20269999: null } })), error => error.status === 404);
  assert.deepEqual(state, { cases: [], tracks: [], events: [], operations: [] });
});

test('duplicate submission replays its result without duplicate cases, tracks or events', async () => {
  const batch = input();
  const first = await verifyGraduateBatch(1, batch);
  const before = structuredClone(state);
  assert.deepEqual(await verifyGraduateBatch(1, batch), first);
  assert.deepEqual(state, before);
  await assert.rejects(verifyGraduateBatch(1, { ...batch, outcome: 'NOT_LISTED' }),
    error => error.code === 'OPERATION_REUSED');
  assert.deepEqual(state, before);
});

test('a pre-release operation can still replay after the environment list setting is removed', async () => {
  const batch = input({ sourceVersion: 'RAC-final-2026-v1' });
  const response = { success: true, results: [{ studentNumber: 20260001, outcome: 'VERIFIED', version: 1 }] };
  state.operations.push({ id: 1, actor_id: 1, client_key: batch.operationId,
    request_hash: verificationRequestHash(batch), response });
  assert.deepEqual(await verifyGraduateBatch(1, batch), response);
  assert.equal(state.events.length, 0);
});
