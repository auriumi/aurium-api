const test = require('node:test');
const assert = require('node:assert/strict');

// Exercise request validation without opening a database or object-store connection.
const servicePath = require.resolve('../dist/api/review/rac_service.js');
require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: {
  listVerificationGraduates: async (adminId, filters) => ({ success: true, adminId, filters }),
  verificationFilterOptions: async (adminId, cycle, department, course) => ({ success: true, department, course }),
} };
const { listGraduates, getFilterOptions } = require('../dist/api/review/rac_controller.js');

async function request(handler, filters, authenticated = true) {
  const response = { statusCode: 200, body: null,
    setHeader() {}, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({ user: authenticated ? { admin_id: 1 } : undefined,
    query: { year: '2026', term: 'END_YEAR', ...filters } }, response);
  return response;
}

test('RAC browsing accepts program and major filters independently', async () => {
  for (const filters of [{ program: 'BSIT' }, { major: 'English' }, { major: '__no_major__' }]) {
    const response = await request(listGraduates, filters);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.filters.department, null);
    assert.equal(response.body.filters.course, filters.program ?? null);
    assert.equal(response.body.filters.major, filters.major ?? null);
  }
  const options = await request(getFilterOptions, { program: 'BSIT' });
  assert.equal(options.statusCode, 200);
  assert.equal(options.body.course, 'BSIT');
  assert.equal(options.body.department, null);
});

test('independent filters still require valid input and authentication', async () => {
  for (const filters of [{ program: ['BSIT'] }, { major: 'x'.repeat(121) }, { verification: 'LOCKED' }]) {
    assert.equal((await request(listGraduates, filters)).statusCode, 400);
  }
  assert.equal((await request(getFilterOptions, { program: ['BSIT'] })).statusCode, 400);
  assert.equal((await request(listGraduates, { program: 'BSIT' }, false)).statusCode, 401);
});
