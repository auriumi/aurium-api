import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveFrontendOrigin } from "./frontend_origin";

test("frontend origin keeps current defaults and accepts one HTTPS staging origin", () => {
  assert.equal(resolveFrontendOrigin(undefined, "production"), "https://aurium-yearbook.site");
  assert.equal(resolveFrontendOrigin(undefined, "development"), "http://localhost:3000");
  assert.equal(resolveFrontendOrigin("https://test.aurium.example", "production"), "https://test.aurium.example");
  assert.equal(resolveFrontendOrigin("http://localhost:3010", "development"), "http://localhost:3010");
});

test("frontend origin rejects paths, credentials, wildcards, and nonlocal HTTP", () => {
  for (const value of ["https://test.aurium.example/", "https://test.aurium.example/path",
    "https://user@test.aurium.example", "*", "http://test.aurium.example"]) {
    assert.throws(() => resolveFrontendOrigin(value, "production"));
  }
  assert.throws(() => resolveFrontendOrigin("http://localhost:3010", "production"));
  assert.throws(() => resolveFrontendOrigin("http://test.aurium.example", "development"));
});
