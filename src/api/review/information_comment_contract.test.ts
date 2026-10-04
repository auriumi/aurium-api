import assert from "node:assert/strict";
import { test } from "node:test";
import { ReviewStage } from "@prisma/client";
import { commentHash, matchesInformationCommentContext, readInformationComment } from "./information_comment_contract";

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
  assert.equal(readInformationComment({ ...request, revisionId: undefined }), null);
  assert.deepEqual(readInformationComment({ ...request, revisionId: null }), { ...request, revisionId: null });
});

test("initial comments require an explicit empty revision context in Pending", () => {
  assert.equal(matchesInformationCommentContext(ReviewStage.DRAFT, null, null), true);
  assert.equal(matchesInformationCommentContext(ReviewStage.DRAFT, 8, null), false);
  assert.equal(matchesInformationCommentContext(ReviewStage.DRAFT, null, 8), false);
  for (const stage of Object.values(ReviewStage).filter(stage => stage !== ReviewStage.DRAFT)) {
    assert.equal(matchesInformationCommentContext(stage, null, null), false);
  }
});

test("comments retain exact revision context in every stage, including completed", () => {
  for (const stage of Object.values(ReviewStage)) {
    assert.equal(matchesInformationCommentContext(stage, 8, 8), true);
    assert.equal(matchesInformationCommentContext(stage, 8, 7), false);
  }
});

test("retry fingerprint changes when comment text or revision changes", () => {
  assert.equal(commentHash(9, request), commentHash(9, request));
  assert.notEqual(commentHash(9, request), commentHash(9, { ...request, note: "Another comment." }));
  assert.notEqual(commentHash(9, request), commentHash(9, { ...request, revisionId: 10 }));
  assert.notEqual(commentHash(9, request), commentHash(9, { ...request, revisionId: null }));
});
