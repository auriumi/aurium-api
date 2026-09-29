import assert from "node:assert/strict";
import { test } from "node:test";
import { commentHash, readInformationComment } from "./information_comment_contract";

const operationId = "54e3cc16-24ac-4b0a-8ed0-cfe580551ca7";
const request = { expectedVersion: 4, revisionId: 8, operationId, note: "Please check the spelling." };

test("comments require a bounded note and exact revision/version", () => {
  assert.deepEqual(readInformationComment(request), request);
  assert.equal(readInformationComment({ ...request, note: "  " }), null);
  assert.equal(readInformationComment({ ...request, note: " padded " }), null);
  assert.equal(readInformationComment({ ...request, note: "x".repeat(2001) }), null);
  assert.equal(readInformationComment({ ...request, expectedVersion: 0 }), null);
  assert.equal(readInformationComment({ ...request, revisionId: 0 }), null);
  assert.equal(readInformationComment({ ...request, studentNumber: 123 }), null);
});

test("retry fingerprint changes when comment text or revision changes", () => {
  assert.equal(commentHash(9, request), commentHash(9, request));
  assert.notEqual(commentHash(9, request), commentHash(9, { ...request, note: "Another comment." }));
  assert.notEqual(commentHash(9, request), commentHash(9, { ...request, revisionId: 10 }));
});
