const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { IncomingMessage, ServerResponse } = require('node:http');
const { PassThrough } = require('node:stream');
const jwt = require('jsonwebtoken');
const express = require('express');

// Exercise the actual server mounts and routers. Only controllers and external
// dependencies are replaced; a request must pass the real authentication,
// permission, origin and rate-limit middleware to reach a controller sentinel.
process.env.JWT_SAUCE = 'review-http-test-only-secret';
process.env.FRONTEND_ORIGIN = 'http://localhost:3020';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
const dist = path.resolve(__dirname, '../dist');
function stub(filename, exports) {
  const id = require.resolve(filename);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub(path.join(dist, 'instrument.js'), {});
stub('@sentry/node', { setupExpressErrorHandler() {} });
stub(path.join(dist, 'config/prisma.js'), { __esModule: true, default: new Proxy({}, {
  get() { throw new Error('HTTP boundary tests must not use a database'); },
}) });
for (const resource of ['auth', 'student']) {
  stub(path.join(dist, `api/${resource}/${resource}_route.js`), { __esModule: true, default: express.Router() });
}
for (const file of [
  'admin/admin_controller', 'admin/masterlist_detail_controller',
  'review/assignments/assignment_controller', 'review/rac/rac_controller',
  'review/information/information_controller', 'review/photos/photo_controller',
  'review/corrections/correction_controller', 'review/targets/target_controller',
]) {
  stub(path.join(dist, `api/${file}.js`), new Proxy({ __esModule: true }, {
    get(target, key) {
      if (key === '__esModule') return true;
      return (req, res) => res.json({ handler: `${file}:${String(key)}`, params: req.params });
    },
  }));
}
const app = require('../dist/server.js').default;
const member = jwt.sign({ is_admin: true, role: 'MEMBER', admin_id: 1 }, process.env.JWT_SAUCE);
const moderator = jwt.sign({ is_admin: true, role: 'MODERATOR', admin_id: 2 }, process.env.JWT_SAUCE);
const student = jwt.sign({ is_admin: false, role: 'MEMBER', student_number: 99000001 }, process.env.JWT_SAUCE);
const wrongRole = jwt.sign({ is_admin: true, role: 'NOT_A_ROLE', admin_id: 1 }, process.env.JWT_SAUCE);

const endpoints = [
  ['GET', '/capabilities', '/review-capabilities', 'assignments/assignment_controller:getCapabilities'],
  ['GET', '/staff', '/review-staff', 'assignments/assignment_controller:getReviewStaff'],
  ['POST', '/assignments', '/review-assignments', 'assignments/assignment_controller:createAssignment'],
  ['PATCH', '/assignments/12', '/review-assignments/12', 'assignments/assignment_controller:deactivateAssignment'],
  ['GET', '/rac/graduates', '/review-graduates', 'rac/rac_controller:listGraduates'],
  ['GET', '/rac/graduates/filter-options', '/review-graduate-filter-options', 'rac/rac_controller:getFilterOptions'],
  ['GET', '/rac/graduates/99000001/verification-events', '/review-graduates/99000001/verification-events', 'rac/rac_controller:getHistory'],
  ['POST', '/rac/verification-batches', '/verification-batches', 'rac/rac_controller:createVerificationBatch'],
];
for (const [resource, legacy, controller, operations] of [
  ['information', 'information-reviews', 'information_controller', [
    ['GET', '', '', 'listReviews'], ['GET', '/filter-options', '/filter-options', 'getFilterOptions'],
    ['GET', '/12', '/12', 'getReview'], ['GET', '/12/revisions', '/12/revisions', 'getDraftHistory'],
    ['GET', '/12/decision-events', '/12/decision-events', 'getDecisionHistory'],
    ['PATCH', '/12/draft', '/12/draft', 'saveDraft'], ['POST', '/12/comments', '/12/comments', 'addComment'],
    ['POST', '/12/submissions', '/12/submission', 'submitReview'],
    ['POST', '/12/qc-decisions', '/12/qc-decision', 'decideQc'],
    ['POST', '/12/moderator-decisions', '/12/moderator-decision', 'decideModerator'],
  ]],
  ['photos', 'photo-reviews', 'photo_controller', [
    ['GET', '', '', 'list'], ['GET', '/filter-options', '/filter-options', 'filterOptions'],
    ['GET', '/12', '/12', 'detail'], ['GET', '/12/decision-events', '/12/decision-events', 'decisionHistory'],
    ['POST', '/12/comments', '/12/comments', 'comment'], ['POST', '/12/uploads', '/12/uploads', 'beginUpload'],
    ['POST', '/12/uploads/34/finalization', '/12/uploads/34/finalize', 'finalizeUpload'],
    ['POST', '/12/submissions', '/12/submission', 'submit'],
    ['POST', '/12/qc-decisions', '/12/qc-decision', 'qcDecision'],
    ['POST', '/12/moderator-decisions', '/12/moderator-decision', 'moderatorDecision'],
  ]],
]) {
  for (const [method, canonicalSuffix, legacySuffix, handler] of operations) {
    endpoints.push([method, `/${resource}/reviews${canonicalSuffix}`, `/${legacy}${legacySuffix}`, `${resource}/${controller}:${handler}`]);
  }
}
endpoints.push(
  ['POST', '/tracks/12/corrections', '/review-tracks/12/correction-requests', 'corrections/correction_controller:create'],
  ['GET', '/corrections', '/correction-requests', 'corrections/correction_controller:list'],
  ['POST', '/corrections/12/decisions', '/correction-requests/12/decisions', 'corrections/correction_controller:decide'],
);

test('review server mounts preserve security and dispatch canonical and compatibility requests', async t => {
  let requestNumber = 0;
  async function request(url, { method = 'GET', token = moderator, origin = process.env.FRONTEND_ORIGIN, ip } = {}) {
    const headers = { 'x-forwarded-for': ip || `192.0.2.${(++requestNumber % 200) + 1}` };
    if (token) headers.cookie = `token=${token}`;
    if (origin) headers.origin = origin;
    // Dispatch Node request/response objects through the real application without
    // opening a socket. This keeps auth tests independent of network permissions.
    return new Promise((resolve, reject) => {
      const socket = new PassThrough();
      socket.remoteAddress = '127.0.0.1';
      const req = new IncomingMessage(socket);
      req.method = method;
      req.url = url;
      req.headers = headers;
      const res = new ServerResponse(req);
      res.end = chunk => {
        const result = { status: res.statusCode, body: chunk?.toString() || '', retryAfter: res.getHeader('Retry-After') };
        res.emit('finish');
        socket.destroy();
        resolve(result);
        return res;
      };
      app.handle(req, res, error => {
        if (error) { socket.destroy(); reject(error); }
        else { res.statusCode = 404; res.end(); }
      });
    });
  }
  await t.test('both parents deny anonymous, invalid and non-admin tokens', async () => {
    for (const prefix of ['/api/admin', '/api/v1/admin']) {
      for (const [token, status] of [[null, 401], ['invalid', 403], [student, 403], [wrongRole, 403]]) {
        assert.equal((await request(`${prefix}/review-capabilities`, { token })).status, status);
      }
    }
    assert.equal((await request('/api/v1/admin/capabilities', { token: null })).status, 401);
  });
  await t.test('every resource route reaches the same handler through each supported path', async () => {
    for (const [method, canonical, legacy, handler] of endpoints) {
      for (const url of [`/api/v1/admin${canonical}`, `/api/v1/admin${legacy}`, `/api/admin${legacy}`]) {
        const response = await request(url, { method });
        assert.equal(response.status, 200, `${method} ${url}: ${response.body}`);
        assert.equal(JSON.parse(response.body).handler, `review/${handler}`);
      }
    }
  });
  await t.test('all writes deny missing or foreign origins before controller dispatch', async () => {
    for (const [method, canonical, legacy] of endpoints.filter(row => row[0] !== 'GET')) {
      for (const url of [`/api/v1/admin${canonical}`, `/api/v1/admin${legacy}`, `/api/admin${legacy}`]) {
        for (const origin of [null, 'https://untrusted.invalid']) {
          const response = await request(url, { method, origin });
          assert.equal(response.status, 403, `${method} ${url}`);
          assert.equal(JSON.parse(response.body).code, 'UNTRUSTED_ORIGIN');
        }
      }
    }
  });
  await t.test('member staff cannot manage assignments while permitted reads reach controllers', async () => {
    assert.equal((await request('/api/v1/admin/assignments', { method: 'POST', token: member })).status, 403);
    assert.equal((await request('/api/admin/review-staff', { token: member })).status, 403);
    assert.equal((await request('/api/v1/admin/capabilities', { token: member })).status, 200);
    assert.equal((await request('/api/v1/admin/masterlist/99000001', { token: member })).status, 200);
  });
  await t.test('targets are v1-only and reach the named controller with the existing guards', async () => {
    for (const [method, suffix, handler] of [
      ['GET', '', 'getTargets'], ['GET', '/me', 'getMyProgress'],
      ['GET', '/schedule', 'getSchedule'], ['GET', '/12/history', 'getHistory'],
      ['PUT', '', 'setTargets'],
    ]) {
      const response = await request(`/api/v1/admin/targets${suffix}`, { method });
      assert.equal(response.status, 200);
      assert.equal(JSON.parse(response.body).handler, `review/targets/target_controller:${handler}`);
      for (const prefix of ['/api/admin/targets', '/api/admin/proofreading-targets', '/api/v1/admin/proofreading-targets']) {
        assert.equal((await request(prefix + suffix, { method })).status, 404);
      }
      assert.equal((await request(`/api/v1/admin/targets${suffix}`, { method, token: null })).status, 401);
    }
    assert.equal((await request('/api/v1/admin/targets/me', { token: member })).status, 200);
    assert.equal((await request('/api/v1/admin/targets', { token: member })).status, 403);
    for (const origin of [null, 'https://untrusted.invalid']) {
      assert.equal((await request('/api/v1/admin/targets', { method: 'PUT', origin })).status, 403);
    }
  });
  await t.test('switching between legacy and v1 paths cannot bypass the shared rate limit', async () => {
    for (let i = 0; i < 100; i++) {
      const url = i % 2 ? '/api/v1/admin/capabilities' : '/api/admin/review-capabilities';
      assert.equal((await request(url, { ip: '198.51.100.200' })).status, 200);
    }
    const response = await request('/api/v1/admin/capabilities', { ip: '198.51.100.200' });
    assert.equal(response.status, 429);
    assert.match(response.body, /Too many request/);
  });
});
