const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/aurium_test";
process.env.JWT_SAUCE ??= "test-secret";
process.env.RESEND_API ??= "test";
process.env.R2_ACC_ID ??= "test";
process.env.R2_ACC_KEY ??= "test";
process.env.R2_SECRET_KEY ??= "test";

const {
  ADMIN_RATE_LIMITS,
  default: app,
} = require("../dist/server.js");

let baseUrl;
let server;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  await response.text();
  return response;
}

test("a full three-minute queue polling cycle does not hit the limiter", async () => {
  const pollIntervalMs = 5_000;
  const expectedRequests = Math.floor(
    ADMIN_RATE_LIMITS.windowMs / pollIntervalMs,
  ) + 1;

  assert.equal(expectedRequests, 37);
  assert.ok(expectedRequests < ADMIN_RATE_LIMITS.queuePolls);

  for (let requestNumber = 1; requestNumber <= expectedRequests; requestNumber += 1) {
    const response = await request("/api/admin/queue/list?period=AM");

    assert.equal(
      response.status,
      401,
      `queue request ${requestNumber} was unexpectedly rate limited`,
    );
  }
});

test("queue polling does not consume the other admin read budget", async () => {
  for (
    let requestNumber = 1;
    requestNumber <= ADMIN_RATE_LIMITS.reads;
    requestNumber += 1
  ) {
    const response = await request("/api/admin/profile");

    assert.equal(
      response.status,
      401,
      `admin read ${requestNumber} was rate limited too early`,
    );
  }

  const limitedResponse = await request("/api/admin/profile");
  assert.equal(limitedResponse.status, 429);
});

test("queue polling does not consume the admin mutation budget", async () => {
  for (
    let requestNumber = 1;
    requestNumber <= ADMIN_RATE_LIMITS.mutations;
    requestNumber += 1
  ) {
    const response = await request("/api/admin/book/add", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    });

    assert.equal(
      response.status,
      401,
      `mutation request ${requestNumber} was rate limited too early`,
    );
  }

  const limitedResponse = await request("/api/admin/book/add", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: "{}",
  });

  assert.equal(limitedResponse.status, 429);
});
