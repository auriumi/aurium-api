const test = require('node:test');
const assert = require('node:assert/strict');

// Exercise request validation without opening a database or object-store connection.
const prismaPath = require.resolve('../dist/config/prisma.js');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true,
  exports: { __esModule: true, default: {} } };
const servicePath = require.resolve('../dist/api/review/information_service.js');
require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: {
  listInformationReviews: async (adminId, filters) => ({ success: true, adminId, filters }),
  informationFilterOptions: async (adminId, cycle, department, course) => ({ success: true, department, course }),
} };
const { listReviews, getFilterOptions } = require('../dist/api/review/information_controller.js');

async function request(handler, filters, authenticated = true) {
  const response = { statusCode: 200, body: null,
    setHeader() {}, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({ user: authenticated ? { admin_id: 1 } : undefined,
    query: { year: '2026', term: 'END_YEAR', ...filters } }, response);
  return response;
}

test('information browsing accepts program and major filters independently', async () => {
  for (const filters of [{ program: 'BSIT' }, { major: 'English' }, { major: '__no_major__' }]) {
    const response = await request(listReviews, filters);
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

test('forwarded reviews have their own filter while malformed requests stay blocked', async () => {
  assert.equal((await request(listReviews, { queue: 'SUBMITTED_MODERATOR' })).statusCode, 200);
  for (const filters of [{ program: ['BSIT'] }, { major: 'x'.repeat(121) }, { queue: 'unknown' }]) {
    assert.equal((await request(listReviews, filters)).statusCode, 400);
  }
  assert.equal((await request(getFilterOptions, { program: ['BSIT'] })).statusCode, 400);
  assert.equal((await request(listReviews, { program: 'BSIT' }, false)).statusCode, 401);
});
