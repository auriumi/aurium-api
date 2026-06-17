const assert = require("node:assert/strict");
const { afterEach, mock, test } = require("node:test");

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/aurium_test";
process.env.RESEND_API ??= "test";

const adminService = require("../dist/api/admin/admin_service.js");
const adminController = require("../dist/api/admin/admin_controller.js");
const studentService = require("../dist/api/student/student_service.js");
const studentController = require("../dist/api/student/student_controller.js");

afterEach(() => {
  mock.restoreAll();
});

function createResponse() {
  const calls = [];
  const response = {
    status(code) {
      calls.push({ type: "status", code });
      return response;
    },
    json(body) {
      calls.push({ type: "json", body });
      return response;
    },
  };

  return { calls, response };
}

function jsonCalls(calls) {
  return calls.filter((call) => call.type === "json");
}

test("fetchUnverifiedStudents returns after a missing page query", async () => {
  const count = mock.method(adminService, "getUnverifiedStudentCount", async () => 1);
  const fetch = mock.method(adminService, "gethUnverifiedStudents", async () => []);
  const { calls, response } = createResponse();

  await adminController.fetchUnverifiedStudents({ query: {} }, response);

  assert.deepEqual(calls, [
    { type: "status", code: 400 },
    { type: "json", body: { error: "Invalid request" } },
  ]);
  assert.equal(count.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
});

test("searchUnverifiedById sends only the missing-record response", async () => {
  const search = mock.method(
    adminService,
    "getUnverifiedStudentById",
    async () => ({ success: false, reason: "Student not found" }),
  );
  const { calls, response } = createResponse();

  await adminController.searchUnverifiedById(
    { params: { id: "20260001" } },
    response,
  );

  assert.equal(search.mock.callCount(), 1);
  assert.deepEqual(calls, [
    { type: "status", code: 404 },
    { type: "json", body: { reason: "Student not found" } },
  ]);
});

test("addSchedule returns after a rejected service operation", async () => {
  const add = mock.method(adminService, "addSchedule", async () => false);
  const { calls, response } = createResponse();

  await adminController.addSchedule(
    { body: { date: "2026-07-01", am_cap: 10, pm_cap: 10 } },
    response,
  );

  assert.equal(add.mock.callCount(), 1);
  assert.deepEqual(calls, [
    { type: "status", code: 400 },
    { type: "json", body: { status: "failed" } },
  ]);
});

test("handleToggleScheduleState sends only the failed-service response", async () => {
  const toggle = mock.method(
    adminService,
    "toggleScheduleState",
    async () => ({ success: false, reason: "Schedule not found" }),
  );
  const { calls, response } = createResponse();

  await adminController.handleToggleScheduleState(
    { query: { id: "9" } },
    response,
  );

  assert.equal(toggle.mock.callCount(), 1);
  assert.deepEqual(calls, [
    { type: "status", code: 404 },
    { type: "json", body: { reason: "Schedule not found" } },
  ]);
});

test("getStudentById returns before profile lookup when identity is missing", async () => {
  const lookup = mock.method(
    studentService,
    "getStudentProfile",
    async () => ({ success: true, student: {} }),
  );
  const { calls, response } = createResponse();

  await studentController.getStudentById({}, response);

  assert.equal(lookup.mock.callCount(), 0);
  assert.deepEqual(calls, [
    { type: "status", code: 404 },
    { type: "json", body: { error: "Invalid request!" } },
  ]);
});

test("getStudentById sends only the missing-profile response", async () => {
  const lookup = mock.method(
    studentService,
    "getStudentProfile",
    async () => ({ success: false, reason: "Student doesn't exist!" }),
  );
  const { calls, response } = createResponse();

  await studentController.getStudentById(
    { user: { student_number: "20260001" } },
    response,
  );

  assert.equal(lookup.mock.callCount(), 1);
  assert.equal(jsonCalls(calls).length, 1);
  assert.deepEqual(calls, [
    { type: "status", code: 404 },
    { type: "json", body: { error: "Student doesn't exist!" } },
  ]);
});
