import assert from "node:assert/strict";
import { test } from "node:test";
import { readPhotoComment, photoCommentHash, photoCommentStage } from "./photo_comment_contract";

const base = { expectedVersion: 7, pairRevisionId: 33,
  operationId: "42434623-185c-496d-82c7-6de90a16649b" };

test("photo comments require an exact pair and bounded plain text", () => {
  assert.equal(readPhotoComment({ ...base, note: " " }), null);
  assert.equal(readPhotoComment({ ...base, note: "  Check the theme  " }), null);
  assert.equal(readPhotoComment({ ...base, note: "bad\u0000note" }), null);
  assert.equal(readPhotoComment({ ...base, note: "x".repeat(2001) }), null);
  assert.equal(readPhotoComment({ ...base, pairRevisionId: 0, note: "Check the theme" }), null);
  assert.equal(readPhotoComment({ ...base, note: "Check the theme" })?.note, "Check the theme");
});

test("only QC and moderator review stages accept photo comments", () => {
  assert.deepEqual(photoCommentStage("SUBMITTED_QC"), { capability: "PHOTO_QC", anchor: "SUBMITTED_QC" });
  assert.deepEqual(photoCommentStage("APPROVED_QC"), { capability: "PHOTO_QC", anchor: "APPROVED_QC" });
  assert.deepEqual(photoCommentStage("SUBMITTED_MODERATOR"),
    { capability: "FINAL_MODERATOR", anchor: "SUBMITTED_MODERATOR" });
  assert.equal(photoCommentStage("DRAFT"), null);
  assert.equal(photoCommentStage("REJECTED_QC"), null);
  assert.equal(photoCommentStage("LOCKED"), null);
  const one = readPhotoComment({ ...base, note: "Check the theme" });
  const two = readPhotoComment({ ...base, note: "Check the graduation photo" });
  assert.ok(one && two);
  assert.notEqual(photoCommentHash(9, one), photoCommentHash(9, two));
});
