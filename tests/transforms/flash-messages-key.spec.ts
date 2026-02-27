import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jscodeshift, { type API } from "jscodeshift";
import transform, { parser } from "../../src/transforms/flash-messages-key.js";

function applyTransform(source: string): string | undefined {
  const j = jscodeshift.withParser(parser!);
  const api: API = { j, jscodeshift: j, stats: () => {}, report: () => {} };
  return transform({ source, path: "app/test.ts" }, api, {});
}

describe("flash-messages-key transform", () => {
  it("renames errors.field to inputErrorsBag.field in flashMessages.get()", () => {
    const input = `const err = flashMessages.get('errors.email')`;
    const output = applyTransform(input);
    assert.ok(output?.includes("inputErrorsBag.email"), "should use inputErrorsBag");
    assert.ok(!output?.includes("errors.email"), "should remove old key");
  });

  it("renames in flashMessages.has() as well", () => {
    const input = `const has = flashMessages.has('errors.username')`;
    const output = applyTransform(input);
    assert.ok(output?.includes("inputErrorsBag.username"));
  });

  it("does not rename non-errors keys", () => {
    const input = `const msg = flashMessages.get('success.message')`;
    const output = applyTransform(input);
    assert.equal(output, undefined, "should not modify non-errors keys");
  });

  it("returns undefined when no flash messages usage", () => {
    const input = `const x = someObj.get('errors.email')`;
    const output = applyTransform(input);
    assert.equal(output, undefined);
  });
});
