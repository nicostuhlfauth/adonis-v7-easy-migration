import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jscodeshift, { type API } from "jscodeshift";
import transform, { parser } from "../../src/transforms/request-response-rename.js";

function applyTransform(source: string): string | undefined {
  const j = jscodeshift.withParser(parser!);
  const api: API = { j, jscodeshift: j, stats: () => {}, report: () => {} };
  return transform({ source, path: "app/test.ts" }, api, {});
}

describe("request-response-rename transform", () => {
  it("renames Request import to HttpRequest", () => {
    const input = `import { Request } from '@adonisjs/core/http'
Request.macro('isJson', function() { return true })`;
    const output = applyTransform(input);
    assert.ok(output?.includes("HttpRequest"), "should use HttpRequest");
    assert.ok(!output?.includes("import { Request }"), "should rename import");
  });

  it("renames Response import to HttpResponse", () => {
    const input = `import { Response } from '@adonisjs/core/http'
Response.macro('toXml', function() { return '<xml/>' })`;
    const output = applyTransform(input);
    assert.ok(output?.includes("HttpResponse"), "should use HttpResponse");
    assert.ok(!output?.includes("import { Response }"), "should rename import");
  });

  it("renames both Request and Response together", () => {
    const input = `import { Request, Response } from '@adonisjs/core/http'`;
    const output = applyTransform(input);
    assert.ok(output?.includes("HttpRequest"));
    assert.ok(output?.includes("HttpResponse"));
  });

  it("renames interface in module augmentation", () => {
    const input = `import { Request } from '@adonisjs/core/http'
declare module '@adonisjs/core/http' {
  interface Request {
    isJson(): boolean
  }
}`;
    const output = applyTransform(input);
    assert.ok(output?.includes("interface HttpRequest"), "should rename interface");
    assert.ok(!output?.includes("interface Request"), "should remove old interface name");
  });

  it("does not rename Request from other sources", () => {
    const input = `import { Request } from 'node-fetch'
const r = new Request('https://example.com')`;
    const output = applyTransform(input);
    assert.equal(output, undefined, "should not modify non-adonis Request imports");
  });
});
