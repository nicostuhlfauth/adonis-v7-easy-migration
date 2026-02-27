import type { Warning, TransformResult, PackageChange, MigrationReport } from "./types.js";

export class Reporter {
  private results: TransformResult[] = [];
  private allWarnings: Warning[] = [];
  private packageChanges: PackageChange[] = [];
  private newFiles: string[] = [];
  private skippedFiles: string[] = [];

  addResult(result: TransformResult) {
    this.results.push(result);
    this.allWarnings.push(...result.warnings);
  }

  addWarning(warning: Warning) {
    this.allWarnings.push(warning);
  }

  addPackageChanges(changes: PackageChange[]) {
    this.packageChanges.push(...changes);
  }

  addNewFile(filePath: string) {
    this.newFiles.push(filePath);
  }

  addSkippedFile(filePath: string) {
    this.skippedFiles.push(filePath);
  }

  getReport(): MigrationReport {
    return {
      results: this.results,
      allWarnings: this.allWarnings,
      packageChanges: this.packageChanges,
      newFiles: this.newFiles,
      skippedFiles: this.skippedFiles,
    };
  }

  print(dryRun: boolean) {
    const hr = "─".repeat(60);
    console.log("\n" + hr);
    console.log("  AdonisJS v6 → v7 Migration Report" + (dryRun ? " [DRY RUN]" : ""));
    console.log(hr);

    // Transform results
    if (this.results.length > 0) {
      console.log("\nTransforms:");
      for (const result of this.results) {
        const name = result.transform.split("/").pop()!.replace(".ts", "");
        if (result.filesChanged > 0) {
          console.log(`  ✓ ${name}: ${result.filesChanged} file(s) changed`);
        } else if (result.filesErrored > 0) {
          console.log(`  ✗ ${name}: ${result.filesErrored} error(s)`);
        } else {
          console.log(`  · ${name}: no changes needed`);
        }
      }
    }

    // New files created
    if (this.newFiles.length > 0) {
      console.log("\nNew files created:");
      for (const f of this.newFiles) {
        console.log(`  + ${f}`);
      }
    }

    // Skipped files (already existed)
    if (this.skippedFiles.length > 0) {
      console.log("\nSkipped (already exist):");
      for (const f of this.skippedFiles) {
        console.log(`  · ${f}`);
      }
    }

    // Package changes
    if (this.packageChanges.length > 0) {
      console.log("\nPackage changes:");
      for (const change of this.packageChanges) {
        const icon = change.action === "add" ? "+" : change.action === "remove" ? "-" : "↑";
        const devLabel = change.dev ? " (dev)" : "";
        console.log(`  ${icon} ${change.name}${devLabel}`);
      }
    }

    // Warnings requiring manual action
    const actionRequired = this.allWarnings.filter((w) => w.actionRequired);
    if (actionRequired.length > 0) {
      console.log("\n⚠  WARNINGS — Manual action required:");
      actionRequired.forEach((w, i) => {
        const loc = w.line ? `${w.file}:${w.line}` : w.file;
        console.log(`\n  [${i + 1}] ${loc}`);
        console.log(`      ${w.message}`);
      });
    }

    // Non-actionable warnings
    const infoWarnings = this.allWarnings.filter((w) => !w.actionRequired && w.severity !== "info");
    if (infoWarnings.length > 0) {
      console.log("\nOther notices:");
      for (const w of infoWarnings) {
        console.log(`  · ${w.file}: ${w.message}`);
      }
    }

    // Errors from transforms
    const errors = this.allWarnings.filter((w) => w.severity === "error");
    if (errors.length > 0) {
      console.log("\n✗ Errors encountered:");
      for (const e of errors) {
        console.log(`  · ${e.file}: ${e.message}`);
      }
    }

    // Behavioral changes (always printed)
    console.log("\nBehavioral changes to review manually:");
    console.log("  · request.all() now includes multipart files alongside fields");
    console.log("  · Auto-generated route names from controllers may conflict with explicit names");
    console.log("  · Status pages (404, 500 etc.) are skipped for JSON API requests");
    console.log("  · VineJS BaseModifiers class has been removed");
    console.log(
      "  · Shutdown hooks now execute in reverse order (last registered = first executed)",
    );

    console.log("\n" + hr);

    if (dryRun) {
      console.log("  Dry run complete. No files were modified.");
    } else if (actionRequired.length > 0) {
      console.log(`  Migration complete with ${actionRequired.length} manual action(s) required.`);
      console.log("  Review the warnings above before starting your application.");
    } else {
      console.log("  Migration complete. Review the behavioral changes above.");
    }
    console.log(hr + "\n");
  }
}
