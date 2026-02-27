import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jscodeshift, { type API } from "jscodeshift";
import transform, { parser } from "../../src/transforms/ace-js.js";

function applyTransform(source: string): string | undefined {
  const j = jscodeshift.withParser(parser!);
  const api: API = { j, jscodeshift: j, stats: () => {}, report: () => {} };
  return transform({ source, path: "ace.js" }, api, {});
}

describe("ace-js transform", () => {
  it("replaces ts-node-maintained/register/esm import", () => {
    const input = `import 'ts-node-maintained/register/esm'\nconsole.log('hello')`;
    const output = applyTransform(input);
    assert.ok(output?.includes("@poppinss/ts-exec"), "should have new import");
    assert.ok(!output?.includes("ts-node-maintained"), "should remove old import");
  });

  it("replaces ts-node/register/esm import", () => {
    const input = `import 'ts-node/register/esm'\nconsole.log('hello')`;
    const output = applyTransform(input);
    assert.ok(output?.includes("@poppinss/ts-exec"));
  });

  it("replaces ts-node/esm import", () => {
    const input = `import 'ts-node/esm'\nconsole.log('hello')`;
    const output = applyTransform(input);
    assert.ok(output?.includes("@poppinss/ts-exec"));
  });

  it("returns undefined when no change needed", () => {
    const input = `import '@poppinss/ts-exec'\nconsole.log('hello')`;
    const output = applyTransform(input);
    assert.equal(output, undefined);
  });
});
