import assert from "node:assert/strict";
import { test } from "node:test";
import { canSubmitPair, readPhotoUpload, readPhotoSubmission } from "./photo_contract";
import { matchesPhotoSignature } from "./photo_storage";

test("photo submission always requires an uploaded pair revision", () => {
  const input = { expectedVersion: 1, revisionId: null, operationId: "932bc2f2-77fb-4afe-8c6e-49b075b25bce" };
  assert.equal(readPhotoSubmission(input), null);
  assert.equal(readPhotoSubmission({ ...input, revisionId: 1 })?.revisionId, 1);
});

test("photo upload contract rejects unsafe types and unexpected fields", () => {
  assert.equal(readPhotoUpload({ type: "GRADUATION", mime: "image/svg+xml", expectedVersion: 1 }), null);
  assert.equal(readPhotoUpload({ type: "THEME", mime: "image/jpeg", expectedVersion: 0 }), null);
  assert.equal(readPhotoUpload({ type: "THEME", mime: "image/jpeg", expectedVersion: 1, url: "https://example.org/a" }), null);
  assert.deepEqual(readPhotoUpload({ type: "THEME", mime: "image/jpeg", expectedVersion: 1 }), {
    type: "THEME", mime: "image/jpeg", expectedVersion: 1,
  });
});

test("photo signatures reject disguised or truncated files", () => {
  const jpeg = Buffer.alloc(64);
  jpeg.set([255, 216, 255], 0);
  jpeg.set([255, 217], 62);
  assert.equal(matchesPhotoSignature(jpeg, "image/jpeg"), true);
  assert.equal(matchesPhotoSignature(jpeg, "image/png"), false);
  jpeg[63] = 0;
  assert.equal(matchesPhotoSignature(jpeg, "image/jpeg"), false);

  const png = Buffer.alloc(64);
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  png.set([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130], 52);
  assert.equal(matchesPhotoSignature(png, "image/png"), true);
  png[60] = 0;
  assert.equal(matchesPhotoSignature(png, "image/png"), false);

  const webp = Buffer.alloc(64);
  webp.write("RIFF", 0, "ascii");
  webp.writeUInt32LE(56, 4);
  webp.write("WEBPVP8 ", 8, "ascii");
  assert.equal(matchesPhotoSignature(webp, "image/webp"), true);
  webp.writeUInt32LE(55, 4);
  assert.equal(matchesPhotoSignature(webp, "image/webp"), false);
  assert.equal(matchesPhotoSignature(Buffer.from("<svg><script>"), "image/jpeg"), false);
});

test("a rechecked complete pair can return to QC without re-uploading", () => {
  assert.equal(canSubmitPair("DRAFT", null, 3), false);
  assert.equal(canSubmitPair("DRAFT", 4, 3), false);
  assert.equal(canSubmitPair("DRAFT", 3, 3), true);
  assert.equal(canSubmitPair("DRAFT", 2, 3), true);
  assert.equal(canSubmitPair("REJECTED_QC", 5, 5), true);
  assert.equal(canSubmitPair("REJECTED_QC", 4, 5), true);
  assert.equal(canSubmitPair("REJECTED_MODERATOR", 7, 7), true);
  assert.equal(canSubmitPair("SUBMITTED_QC", 7, 7), false);
  assert.equal(canSubmitPair("LOCKED", 7, 7), false);
});
