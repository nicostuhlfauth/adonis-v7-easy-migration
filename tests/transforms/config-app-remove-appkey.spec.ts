import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jscodeshift, { type API } from "jscodeshift";
import transform, { parser } from "../../src/transforms/config-app-remove-appkey.js";

function applyTransform(source: string): string | undefined {
  const j = jscodeshift.withParser(parser!);
  const api: API = { j, jscodeshift: j, stats: () => {}, report: () => {} };
  return transform({ source, path: "config/app.ts" }, api, {});
}

describe("config-app-remove-appkey transform", () => {
  it("removes standalone appKey export", () => {
    const input = `import env from '#start/env'\nexport const appKey = env.get('APP_KEY')\nexport const foo = 'bar'`;
    const output = applyTransform(input);
    assert.ok(!output?.includes("appKey"), "should remove appKey");
    assert.ok(output?.includes("foo = 'bar'"), "should keep other exports");
  });

  it("removes appKey when it is the only export", () => {
    const input = `import env from '#start/env'\nexport const appKey = env.get('APP_KEY')`;
    const output = applyTransform(input);
    assert.ok(!output?.includes("appKey"));
  });

  it("returns undefined when appKey not present", () => {
    const input = `import env from '#start/env'\nexport const foo = 'bar'`;
    const output = applyTransform(input);
    assert.equal(output, undefined);
  });
});
