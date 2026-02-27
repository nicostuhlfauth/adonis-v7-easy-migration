import { join } from "node:path";
import { existsSync } from "node:fs";
import { confirm, log, spinner } from "@clack/prompts";

import { detectInstalledPackages } from "./detector.js";
import { Reporter } from "./reporter.js";
import { backupFiles } from "./utils/fs.js";
import { runTransform } from "./utils/jscodeshift-runner.js";
import { buildPackageChanges, applyPackageChanges } from "./utils/package-manager.js";
import { patchConfigEncryption } from "./patchers/patch-config-encryption.js";
import { patchPackageJson } from "./patchers/patch-package-json.js";
import { patchAdonisrc } from "./patchers/patch-adonisrc.js";
import { patchInertia } from "./patchers/patch-inertia.js";
import { patchTsconfig } from "./patchers/patch-tsconfig.js";
import { replaceInEdgeFiles } from "./utils/fs.js";
import type { MigrationContext, InstalledPackages } from "./types.js";

// Lazy-import transform modules (avoids loading jscodeshift for --help etc.)
const TRANSFORMS = {
  aceJs: () => import("./transforms/ace-js.js"),
  configAppRemoveAppkey: () => import("./transforms/config-app-remove-appkey.js"),
  routerMakeUrl: () => import("./transforms/router-make-url.js"),
  helpersRename: () => import("./transforms/helpers-rename.js"),
  cuidWarn: () => import("./transforms/cuid-warn.js"),
  requestResponseRename: () => import("./transforms/request-response-rename.js"),
  flashMessagesKey: () => import("./transforms/flash-messages-key.js"),
};

export interface RunnerOptions {
  projectPath: string;
  dryRun: boolean;
  verbose: boolean;
  skipInstall: boolean;
}

export class Runner {
  private opts: RunnerOptions;
  private reporter = new Reporter();

  constructor(opts: RunnerOptions) {
    this.opts = opts;
  }

  async run() {
    const { projectPath, dryRun, verbose, skipInstall } = this.opts;

    // ── Step 0: Pre-flight ────────────────────────────────────────────────
    this.preflight(projectPath);

    // ── Step 1: Detect packages ───────────────────────────────────────────
    const installedPackages = detectInstalledPackages(projectPath);
    const packageJson = JSON.parse(
      (await import("node:fs")).readFileSync(join(projectPath, "package.json"), "utf-8"),
    );
    const packageChanges = buildPackageChanges(installedPackages);
    this.reporter.addPackageChanges(packageChanges);

    const ctx: MigrationContext = {
      projectPath,
      dryRun,
      verbose,
      skipInstall,
      packageJson,
      installedPackages,
    };

    // ── Step 2: Interactive confirmation ──────────────────────────────────
    this.printSummary(ctx, installedPackages);

    const proceed = await confirm({
      message: dryRun
        ? "Run dry-run (no files will be modified)?"
        : "Apply all migration changes? (a backup will be created first)",
    });
    if (!proceed || proceed === Symbol.for("clack:cancel")) {
      log.warn("Migration cancelled.");
      process.exit(0);
    }

    let confirmInertiaMove = false;
    if (installedPackages.hasInertia) {
      const srcApp = join(projectPath, "inertia", "app", "app.tsx");
      const srcSsr = join(projectPath, "inertia", "app", "ssr.tsx");
      if (existsSync(srcApp) || existsSync(srcSsr)) {
        const ans = await confirm({
          message:
            "Move inertia/app/app.tsx → inertia/app.tsx and inertia/app/ssr.tsx → inertia/ssr.tsx?",
        });
        confirmInertiaMove = !!ans && ans !== Symbol.for("clack:cancel");
      }
    }

    // ── Step 3: Create backups ────────────────────────────────────────────
    if (!dryRun) {
      const s = spinner();
      s.start("Creating backups...");
      this.createBackups(projectPath);
      s.stop("Backups created in .adonis-migration-backup/");
    }

    // ── Step 4: Run jscodeshift transforms ────────────────────────────────
    const s = spinner();
    s.start("Running code transforms...");

    const result1 = await runTransform(
      await TRANSFORMS.aceJs(),
      ["ace.js"],
      projectPath,
      dryRun,
      "ace-js",
      verbose,
    );
    this.reporter.addResult(result1);

    const result2 = await runTransform(
      await TRANSFORMS.configAppRemoveAppkey(),
      ["config/app.ts"],
      projectPath,
      dryRun,
      "config-app-remove-appkey",
      verbose,
    );
    this.reporter.addResult(result2);

    const appGlobs = ["app/**/*.ts", "start/**/*.ts", "providers/**/*.ts"];
    const result3 = await runTransform(
      await TRANSFORMS.routerMakeUrl(),
      appGlobs,
      projectPath,
      dryRun,
      "router-make-url",
      verbose,
    );
    this.reporter.addResult(result3);

    const result4 = await runTransform(
      await TRANSFORMS.helpersRename(),
      [...appGlobs, "database/**/*.ts"],
      projectPath,
      dryRun,
      "helpers-rename",
      verbose,
    );
    this.reporter.addResult(result4);

    const result5 = await runTransform(
      await TRANSFORMS.cuidWarn(),
      [...appGlobs, "database/**/*.ts"],
      projectPath,
      dryRun,
      "cuid-warn",
      verbose,
    );
    // cuid-warn emits via report() — extract warnings and flag as actionRequired
    for (const w of result5.warnings) {
      const lineMatch = w.message.match(/CUID_USAGE:(\d+):/);
      const importMatch = w.message.match(/CUID_IMPORT/);
      this.reporter.addWarning({
        file: w.file,
        line: lineMatch ? parseInt(lineMatch[1]) : undefined,
        message: importMatch
          ? "cuid import from @adonisjs/core/helpers detected. Remove this import and replace cuid() / isCuid() calls with crypto.randomUUID()."
          : w.message.replace(/^CUID_USAGE:\d+:/, ""),
        severity: "warn",
        actionRequired: true,
      });
    }

    const result6 = await runTransform(
      await TRANSFORMS.requestResponseRename(),
      appGlobs,
      projectPath,
      dryRun,
      "request-response-rename",
      verbose,
    );
    this.reporter.addResult(result6);

    const result7 = await runTransform(
      await TRANSFORMS.flashMessagesKey(),
      ["app/**/*.ts", "resources/views/**/*.ts"],
      projectPath,
      dryRun,
      "flash-messages-key",
      verbose,
    );
    this.reporter.addResult(result7);

    // Edge file text-replace (route → urlFor)
    const edgeResult = replaceInEdgeFiles(projectPath, dryRun);
    this.reporter.addResult({
      transform: "edge-route-helper",
      filesChanged: edgeResult.filesChanged,
      filesUnchanged: edgeResult.filesUnchanged,
      filesErrored: 0,
      warnings: [],
    });

    s.stop("Code transforms complete.");

    // ── Step 5: Run structural patchers ───────────────────────────────────
    s.start("Running structural patches...");

    // Create config/encryption.ts
    const encResult = patchConfigEncryption(ctx);
    if (encResult.created) this.reporter.addNewFile("config/encryption.ts");
    if (encResult.skipped) this.reporter.addSkippedFile("config/encryption.ts");

    // Patch adonisrc.ts
    patchAdonisrc(ctx);

    // Patch package.json subpath imports
    patchPackageJson(ctx);

    // Always: patch tsconfig.json (adds rewriteRelativeImportExtensions)
    patchTsconfig(ctx);

    // Inertia-specific patches
    if (installedPackages.hasInertia && confirmInertiaMove) {
      const inertiaResult = patchInertia(ctx);
      for (const c of inertiaResult.changes) {
        this.reporter.addNewFile(c);
      }
      for (const w of inertiaResult.warnings) {
        this.reporter.addWarning(w);
      }
    }

    s.stop("Structural patches complete.");

    // ── Step 6: Package manager operations ────────────────────────────────
    if (!skipInstall && !dryRun) {
      s.start(`Installing packages with ${installedPackages.packageManager}...`);
      try {
        await applyPackageChanges(packageChanges, projectPath, installedPackages.packageManager);
        s.stop("Packages updated.");
      } catch (err) {
        s.stop("Package install encountered an error. Run it manually.");
        this.reporter.addWarning({
          file: "package.json",
          message: `Package install failed: ${err instanceof Error ? err.message : String(err)}. Run the install command manually.`,
          severity: "error",
          actionRequired: true,
        });
      }
    } else if (skipInstall) {
      log.info("Skipping package install (--skip-install).");
    }

    // ── Step 7: Print report ──────────────────────────────────────────────
    this.reporter.print(dryRun);
  }

  private preflight(projectPath: string) {
    const required = ["package.json", "adonisrc.ts", "tsconfig.json"];
    const missing = required.filter((f) => !existsSync(join(projectPath, f)));

    if (missing.length > 0) {
      log.error(
        `The following required files are missing in ${projectPath}:\n  ${missing.join("\n  ")}\n\nIs this an AdonisJS v6 project?`,
      );
      process.exit(1);
    }

    const majorVersion = process.versions.node.split(".")[0];
    if (parseInt(majorVersion) < 20) {
      log.warn(
        `Node.js ${process.versions.node} detected. AdonisJS v7 requires Node.js 24+. ` +
          `The migration will proceed but the project may not run afterwards.`,
      );
    }
  }

  private printSummary(ctx: MigrationContext, pkg: InstalledPackages) {
    console.log("\nDetected configuration:");
    console.log(`  Package manager: ${pkg.packageManager}`);
    console.log(
      `  Inertia:  ${pkg.hasInertia ? `yes (${pkg.inertiaFramework ?? "unknown framework"})` : "no"}`,
    );
    console.log(`  Bouncer:  ${pkg.hasBouncer ? "yes" : "no"}`);
    console.log(`  Tuyau:    ${pkg.hasTuyau ? "yes" : "no"}`);
    console.log(`  Vite:     ${pkg.hasVite ? "yes" : "no"}`);

    console.log("\nPlanned changes:");
    console.log("  · Replace ts-node with @poppinss/ts-exec in ace.js");
    console.log("  · Remove appKey export from config/app.ts");
    console.log("  · Create config/encryption.ts (legacy driver)");
    console.log("  · Add hooks to adonisrc.ts");
    console.log("  · Rename assembler hooks in adonisrc.ts");
    console.log("  · Fix test glob patterns in adonisrc.ts");
    console.log("  · Replace router.makeUrl() with urlFor()");
    console.log(
      "  · Replace removed helpers (getDirname, getFilename, slash, joinToURL, parseImports)",
    );
    console.log("  · Rename Request/Response → HttpRequest/HttpResponse");
    console.log("  · Update flash message error keys (errors.* → inputErrorsBag.*)");
    console.log("  · Replace route() with urlFor() in Edge templates");
    console.log("  · Add subpath imports to package.json");
    console.log("  · Update all @adonisjs/* packages to @latest");
    if (pkg.hasInertia) {
      console.log("  · Move Inertia files (inertia/app/ → inertia/)");
      console.log("  · Update config/inertia.ts");
      console.log("  · Create InertiaMiddleware");
      console.log("  · Register InertiaMiddleware in start/kernel.ts");
      console.log("  · Create tsconfig.inertia.json");
    }

    if (ctx.dryRun) {
      console.log("\n  [DRY RUN] No files will be modified.");
    }
  }

  private createBackups(projectPath: string) {
    const filesToBackup = [
      "ace.js",
      "adonisrc.ts",
      "tsconfig.json",
      "package.json",
      "config/app.ts",
      "config/inertia.ts",
      "start/kernel.ts",
    ].map((f) => join(projectPath, f));

    backupFiles(filesToBackup, projectPath);
  }
}
