import { join } from "node:path";
import { readFile, writeFile, fileExists } from "../utils/fs.js";
import type { MigrationContext } from "../types.js";

const TSCONFIG_INERTIA_CONTENT = `{
  "extends": "./inertia/tsconfig.json",
  "compilerOptions": {
    "rootDir": "./inertia",
    "composite": true
  },
  "include": ["./inertia/**/*.ts", "./inertia/**/*.tsx"]
}
`;

/**
 * 1. Adds `rewriteRelativeImportExtensions: true` to the root tsconfig.json
 *    (required by @poppinss/ts-exec in v7)
 * 2. For Inertia projects: creates tsconfig.inertia.json and adds references
 */
export function patchTsconfig(ctx: MigrationContext): { changes: string[] } {
  const changes: string[] = [];

  // Always: add rewriteRelativeImportExtensions to root tsconfig.json
  const rootTsconfigPath = join(ctx.projectPath, "tsconfig.json");
  if (fileExists(rootTsconfigPath)) {
    const tsconfig = JSON.parse(readFile(rootTsconfigPath));
    if (!tsconfig.compilerOptions) tsconfig.compilerOptions = {};
    if (!tsconfig.compilerOptions.rewriteRelativeImportExtensions) {
      tsconfig.compilerOptions.rewriteRelativeImportExtensions = true;
      writeFile(rootTsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n", ctx.dryRun);
      changes.push("Added rewriteRelativeImportExtensions to tsconfig.json");
    }
  }

  if (!ctx.installedPackages.hasInertia) return { changes };

  // Create tsconfig.inertia.json
  const inertiaConfigPath = join(ctx.projectPath, "tsconfig.inertia.json");
  if (!fileExists(inertiaConfigPath)) {
    writeFile(inertiaConfigPath, TSCONFIG_INERTIA_CONTENT, ctx.dryRun);
    changes.push("Created tsconfig.inertia.json");
  }

  // Update root tsconfig.json with Inertia reference
  if (!fileExists(rootTsconfigPath)) return { changes };

  const tsconfig = JSON.parse(readFile(rootTsconfigPath));

  const references: Array<{ path: string }> = tsconfig.references ?? [];
  const hasInertiaRef = references.some((r) => r.path === "./tsconfig.inertia.json");

  if (!hasInertiaRef) {
    tsconfig.references = [...references, { path: "./tsconfig.inertia.json" }];
    writeFile(rootTsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n", ctx.dryRun);
    changes.push("Added tsconfig.inertia.json reference to tsconfig.json");
  }

  return { changes };
}
