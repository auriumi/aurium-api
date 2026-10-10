import assert from "node:assert/strict";
import { test } from "node:test";
import { correctionHash, readCorrectionDecision, readCorrectionRequest, requiresMakerChange } from "./correction_contract";

const operationId = "123e4567-e89b-42d3-a456-426614174000";

test("correction requests require a bounded reason, version and retry key", () => {
  assert.ok(readCorrectionRequest({ expectedVersion: 3, operationId, reason: "Correct the spelling" }));
  assert.equal(readCorrectionRequest({ expectedVersion: 3, operationId, reason: " " }), null);
  assert.equal(readCorrectionRequest({ expectedVersion: 3, operationId, reason: "x", adminId: 4 }), null);
  assert.equal(readCorrectionRequest({ expectedVersion: 0, operationId, reason: "x" }), null);
});

test("a reopened baseline cannot be resubmitted before the maker creates a newer revision", () => {
  assert.equal(requiresMakerChange("APPROVED", 10, 10), true);
  assert.equal(requiresMakerChange("APPROVED", 10, 11), false);
  assert.equal(requiresMakerChange("REJECTED", null, 10), false);
});

test("IT decisions require a reason only for rejection and bind retries to content", () => {
  assert.ok(readCorrectionDecision({ expectedVersion: 3, operationId, decision: "APPROVE" }));
  assert.ok(readCorrectionDecision({ expectedVersion: 3, operationId, decision: "REJECT", reason: "Not justified" }));
  assert.equal(readCorrectionDecision({ expectedVersion: 3, operationId, decision: "REJECT" }), null);
  assert.equal(readCorrectionDecision({ expectedVersion: 3, operationId, decision: "APPROVE", reason: "x" }), null);
  assert.notEqual(correctionHash([12, 3, "APPROVE", null]), correctionHash([12, 3, "REJECT", "x"]));
});
