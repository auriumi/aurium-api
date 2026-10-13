import assert from "node:assert/strict";
import { test } from "node:test";
import { readPhotoComment, photoCommentHash, matchesPhotoCommentContext } from "./photo_comment_contract";

const base = { expectedVersion: 7, pairRevisionId: 33,
  operationId: "42434623-185c-496d-82c7-6de90a16649b" };

test("photo comments require an exact pair and bounded plain text", () => {
  assert.equal(readPhotoComment({ ...base, note: " " }), null);
  assert.equal(readPhotoComment({ ...base, note: "  Check the theme  " }), null);
  assert.equal(readPhotoComment({ ...base, note: "bad\u0000note" }), null);
  assert.equal(readPhotoComment({ ...base, note: "x".repeat(2001) }), null);
  assert.equal(readPhotoComment({ ...base, pairRevisionId: 0, note: "Check the theme" }), null);
  assert.equal(readPhotoComment({ ...base, pairRevisionId: undefined, note: "Check the theme" }), null);
  assert.equal(readPhotoComment({ ...base, pairRevisionId: null, note: "Waiting for the photo session" })?.pairRevisionId, null);
  assert.equal(readPhotoComment({ ...base, note: "Check the theme" })?.note, "Check the theme");
});

test("comments match the current pair throughout the workflow, including completed reviews", () => {
  for (const stage of ["DRAFT", "SUBMITTED_QC", "APPROVED_QC", "SUBMITTED_MODERATOR",
    "REJECTED_QC", "REJECTED_MODERATOR", "LOCKED"] as const) {
    assert.equal(matchesPhotoCommentContext(stage, 33, 33), true);
    assert.equal(matchesPhotoCommentContext(stage, 34, 33), false);
    assert.equal(matchesPhotoCommentContext(stage, 33, null), false);
  }
  assert.equal(matchesPhotoCommentContext("DRAFT", null, null), true);
  assert.equal(matchesPhotoCommentContext("DRAFT", null, 33), false);
  assert.equal(matchesPhotoCommentContext("LOCKED", null, null), false);
});

test("idempotency binds the comment text and its exact pair context", () => {
  const one = readPhotoComment({ ...base, note: "Check the theme" });
  const two = readPhotoComment({ ...base, note: "Check the graduation photo" });
  assert.ok(one && two);
  assert.notEqual(photoCommentHash(9, one), photoCommentHash(9, two));
  assert.notEqual(photoCommentHash(9, one), photoCommentHash(9, { ...one, pairRevisionId: null }));
});
