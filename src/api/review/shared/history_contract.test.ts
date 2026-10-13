import assert from "node:assert/strict";
import { test } from "node:test";
import { readHistoryCursor } from "./history_contract";

test("history cursors accept missing, exhausted and bounded positive versions", () => {
  assert.equal(readHistoryCursor(undefined), null);
  assert.equal(readHistoryCursor("0"), 0);
  assert.equal(readHistoryCursor("2147483647"), 2147483647);
  for (const value of [null, [], {}, 12, "", " 1", "-1", "1.5", "1e2", "01", "2147483648"]) {
    assert.throws(() => readHistoryCursor(value), { code: "INVALID_CURSOR" });
  }
});
