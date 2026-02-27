import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jscodeshift, { type API } from "jscodeshift";
import transform, { parser } from "../../src/transforms/router-make-url.js";

function applyTransform(source: string): string | undefined {
  const j = jscodeshift.withParser(parser!);
  const api: API = { j, jscodeshift: j, stats: () => {}, report: () => {} };
  return transform({ source, path: "app/controllers/test.ts" }, api, {});
}

describe("router-make-url transform", () => {
  it("replaces router.makeUrl with urlFor and updates import", () => {
    const input = `import router from '@adonisjs/core/services/router'
const url = router.makeUrl('posts.show', { id: 1 })`;
    const output = applyTransform(input);
    assert.ok(output?.includes("urlFor('posts.show'"), "should use urlFor");
    assert.ok(
      output?.includes("@adonisjs/core/services/url_builder"),
      "should add url_builder import",
    );
    assert.ok(!output?.includes("router.makeUrl"), "should remove makeUrl call");
  });

  it("keeps router import if router is still used for routes", () => {
    const input = `import router from '@adonisjs/core/services/router'
router.get('/posts', [PostsController, 'index'])
const url = router.makeUrl('posts.show', { id: 1 })`;
    const output = applyTransform(input);
    assert.ok(
      output?.includes("import router from '@adonisjs/core/services/router'"),
      "should keep router import",
    );
    assert.ok(output?.includes("urlFor('posts.show'"), "should use urlFor");
  });

  it("removes router import if only used for makeUrl", () => {
    const input = `import router from '@adonisjs/core/services/router'
const url = router.makeUrl('posts.show', { id: 1 })`;
    const output = applyTransform(input);
    assert.ok(
      !output?.includes("import router from '@adonisjs/core/services/router'"),
      "should remove router import",
    );
  });

  it("returns undefined when no makeUrl calls exist", () => {
    const input = `import router from '@adonisjs/core/services/router'
router.get('/posts', [PostsController, 'index'])`;
    const output = applyTransform(input);
    assert.equal(output, undefined);
  });
});
