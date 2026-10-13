import assert from "node:assert/strict";
import { test } from "node:test";
import { legacyImageFilter } from "./image_management_filter";

test("legacy missing filters exclude verified graduates without hiding the full list", () => {
  assert.deepEqual(legacyImageFilter("ALL", 2026), {});
  for (const missing of ["GRADUATION", "THEME", "BOTH", "NONE"]) {
    const filter = legacyImageFilter(missing, 2026);
    assert.match(JSON.stringify(filter), /"reviewCases":\{"none":\{"grad_year":2026,"outcome":"VERIFIED"\}\}/);
  }
});
