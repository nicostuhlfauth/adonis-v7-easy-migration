import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jscodeshift, { type API } from "jscodeshift";
import transform, { parser } from "../../src/transforms/helpers-rename.js";

function applyTransform(source: string): string | undefined {
  const j = jscodeshift.withParser(parser!);
  const api: API = { j, jscodeshift: j, stats: () => {}, report: () => {} };
  return transform({ source, path: "app/test.ts" }, api, {});
}

describe("helpers-rename transform", () => {
  it("replaces getDirname() with import.meta.dirname", () => {
    const input = `import { getDirname } from '@adonisjs/core/helpers'
const dir = getDirname()`;
    const output = applyTransform(input);
    assert.ok(output?.includes("import.meta.dirname"), "should use import.meta.dirname");
    assert.ok(!output?.includes("getDirname"), "should remove getDirname");
  });

  it("replaces getFilename() with import.meta.filename", () => {
    const input = `import { getFilename } from '@adonisjs/core/helpers'
const file = getFilename()`;
    const output = applyTransform(input);
    assert.ok(output?.includes("import.meta.filename"), "should use import.meta.filename");
    assert.ok(!output?.includes("getFilename"), "should remove getFilename");
  });

  it("replaces slash(x) with stringHelpers.toUnixSlash(x) and adds import", () => {
    const input = `import { slash } from '@adonisjs/core/helpers'
const result = slash('/foo/bar')`;
    const output = applyTransform(input);
    assert.ok(output?.includes("stringHelpers.toUnixSlash"), "should use toUnixSlash");
    assert.ok(
      output?.includes("@adonisjs/core/helpers/string"),
      "should add string helpers import",
    );
    assert.ok(!output?.includes("slash('/foo"), "should remove old slash call");
  });

  it("replaces joinToURL(base, path) with new URL(path, base) (swaps arguments)", () => {
    const input = `import { joinToURL } from '@adonisjs/core/helpers'
const url = joinToURL('https://example.com', '/api/v1')`;
    const output = applyTransform(input);
    assert.ok(output?.includes("new URL"), "should use new URL");
    // Arguments should be swapped: new URL('/api/v1', 'https://example.com')
    assert.ok(output?.includes("new URL('/api/v1', 'https://example.com')"), "should swap args");
  });

  it("replaces parseImports with direct import from parse-imports", () => {
    const input = `import { parseImports } from '@adonisjs/core/helpers'
const result = await parseImports(source)`;
    const output = applyTransform(input);
    assert.ok(output?.includes("parse-imports"), "should import from parse-imports");
    assert.ok(!output?.includes("@adonisjs/core/helpers"), "should remove helpers import");
  });

  it("returns undefined when no helpers are used", () => {
    const input = `import { string } from '@adonisjs/core/helpers'\nconst x = string.camelCase('hello')`;
    const output = applyTransform(input);
    assert.equal(output, undefined);
  });
});
