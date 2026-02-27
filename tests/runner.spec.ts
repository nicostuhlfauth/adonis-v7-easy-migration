import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, cpSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Runner } from "../src/runner.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_SRC = join(__dirname, "fixtures", "v6-project");
const TMP_DIR = join(__dirname, "..", "tmp", "test-project");

describe("Runner integration test", () => {
  before(() => {
    // Copy fixture to a temp directory so we can modify it
    rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
    cpSync(FIXTURE_SRC, TMP_DIR, { recursive: true });
  });

  after(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("dry-run produces no file changes", async () => {
    const aceContentBefore = readFileSync(join(TMP_DIR, "ace.js"), "utf-8");
    const configBefore = readFileSync(join(TMP_DIR, "config", "app.ts"), "utf-8");

    const runner = new Runner({
      projectPath: TMP_DIR,
      dryRun: true,
      verbose: false,
      skipInstall: true,
    });

    // We can't run the interactive prompts in test, so we test the transforms directly
    // by running them via jscodeshift-runner
    const { runTransform } = await import("../src/utils/jscodeshift-runner.js");
    const aceTransform = await import("../src/transforms/ace-js.js");

    const result = await runTransform(aceTransform, ["ace.js"], TMP_DIR, true, "ace-js", false);

    // Dry run: file should be unchanged on disk
    const aceContentAfter = readFileSync(join(TMP_DIR, "ace.js"), "utf-8");
    assert.equal(aceContentBefore, aceContentAfter, "dry run should not modify ace.js");
    assert.equal(result.filesChanged, 1, "should report 1 file changed (in memory)");
  });

  it("ace-js transform correctly updates ace.js", async () => {
    const { runTransform } = await import("../src/utils/jscodeshift-runner.js");
    const aceTransform = await import("../src/transforms/ace-js.js");

    await runTransform(aceTransform, ["ace.js"], TMP_DIR, false, "ace-js", false);

    const aceContent = readFileSync(join(TMP_DIR, "ace.js"), "utf-8");
    assert.ok(aceContent.includes("@poppinss/ts-exec"), "should have new import");
    assert.ok(!aceContent.includes("ts-node-maintained"), "should remove old import");
  });

  it("config-app transform removes appKey", async () => {
    const { runTransform } = await import("../src/utils/jscodeshift-runner.js");
    const appKeyTransform = await import("../src/transforms/config-app-remove-appkey.js");

    await runTransform(appKeyTransform, ["config/app.ts"], TMP_DIR, false, "config-app", false);

    const configContent = readFileSync(join(TMP_DIR, "config", "app.ts"), "utf-8");
    assert.ok(!configContent.includes("appKey"), "should remove appKey export");
    assert.ok(configContent.includes("defineConfig"), "should keep defineConfig");
  });

  it("patchConfigEncryption creates config/encryption.ts", async () => {
    const { patchConfigEncryption } = await import("../src/patchers/patch-config-encryption.js");
    const ctx = {
      projectPath: TMP_DIR,
      dryRun: false,
      verbose: false,
      skipInstall: true,
      packageJson: {},
      installedPackages: {
        hasInertia: false,
        hasBouncer: false,
        hasTuyau: false,
        hasVite: false,
        hasArgon2: false,
        hasEdge: false,
        packageManager: "pnpm" as const,
      },
    };

    const result = patchConfigEncryption(ctx);
    assert.ok(result.created || result.skipped, "should create or skip");

    const encPath = join(TMP_DIR, "config", "encryption.ts");
    if (result.created) {
      assert.ok(existsSync(encPath), "should create file");
      const content = readFileSync(encPath, "utf-8");
      assert.ok(content.includes("drivers.legacy"), "should use legacy driver");
    }
  });

  it("replaceInEdgeFiles updates route() to urlFor() in edge templates", async () => {
    const { replaceInEdgeFiles } = await import("../src/utils/fs.js");
    const result = replaceInEdgeFiles(TMP_DIR, false);

    assert.ok(result.filesChanged >= 1, "should change at least 1 edge file");

    const edgeContent = readFileSync(
      join(TMP_DIR, "resources", "views", "posts", "index.edge"),
      "utf-8",
    );
    assert.ok(edgeContent.includes("urlFor("), "should use urlFor");
    assert.ok(!edgeContent.includes("route('"), "should remove route(");
  });
});
