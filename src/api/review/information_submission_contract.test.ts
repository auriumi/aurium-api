import assert from "node:assert/strict";
import { test } from "node:test";
import { canSubmitInformation, readInformationSubmission, submissionHash } from "./information_submission_contract";

const input = { expectedVersion: 1, revisionId: null, operationId: "932bc2f2-77fb-4afe-8c6e-49b075b25bce" };

test("initial review explicitly requests a snapshot, while malformed revisions are rejected", () => {
  assert.deepEqual(readInformationSubmission(input), input);
  for (const revisionId of [undefined, 0, -1, 1.5, "1", 2147483648]) {
    assert.equal(readInformationSubmission({ ...input, revisionId }), null);
  }
  assert.equal(readInformationSubmission({ ...input, schoolEmail: "changed@example.invalid" }), null);
  assert.notEqual(submissionHash(1, input), submissionHash(1, { ...input, revisionId: 1 }));
});

test("an unchanged initial review cannot bypass returned or final review stages", () => {
  assert.equal(canSubmitInformation("DRAFT", 1, null), true);
  assert.equal(canSubmitInformation("REJECTED_QC", 2, 3), false);
  assert.equal(canSubmitInformation("REJECTED_MODERATOR", 3, 3), false);
  assert.equal(canSubmitInformation("REJECTED_MODERATOR", 4, 3), true);
  for (const stage of ["SUBMITTED_QC", "APPROVED_QC", "SUBMITTED_MODERATOR", "LOCKED"] as const) {
    assert.equal(canSubmitInformation(stage, 5, null), false);
  }
});
