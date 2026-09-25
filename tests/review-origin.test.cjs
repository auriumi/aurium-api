const test = require('node:test');
const assert = require('node:assert/strict');
const { requireReviewOrigin } = require('../dist/api/review/review_origin.js');
const { frontendOrigin } = require('../dist/config/frontend_origin.js');

function check(origin) {
  let nextCalls = 0;
  let status = 200;
  let body;
  const req = { get: () => origin };
  const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
  requireReviewOrigin(req, res, () => { nextCalls += 1; });
  return { nextCalls, status, body };
}

test('review writes accept only the configured frontend origin', () => {
  assert.equal(check(frontendOrigin).nextCalls, 1);
  assert.equal(check(undefined).status, 403);
  assert.equal(check(`${frontendOrigin}.attacker.example`).status, 403);
  assert.equal(check('https://another.example').body.code, 'UNTRUSTED_ORIGIN');
});
