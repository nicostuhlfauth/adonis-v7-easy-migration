import { join } from "node:path";
import { readFile, writeFile } from "../utils/fs.js";
import type { MigrationContext } from "../types.js";

const SUBPATH_IMPORTS: Record<string, string> = {
  "#generated/*": "./.adonisjs/server/*.js",
  "#transformers/*": "./app/transformers/*.js",
  "#database/*": "./database/*.js",
};

/**
 * Adds the required subpath imports to package.json.
 * Only adds entries that don't already exist.
 */
export function patchPackageJson(ctx: MigrationContext): { added: string[] } {
  const filePath = join(ctx.projectPath, "package.json");
  const pkg = JSON.parse(readFile(filePath));

  const existing: Record<string, string> = pkg.imports ?? {};
  const added: string[] = [];

  for (const [key, value] of Object.entries(SUBPATH_IMPORTS)) {
    if (!(key in existing)) {
      existing[key] = value;
      added.push(key);
    }
  }

  if (added.length > 0) {
    pkg.imports = existing;
    writeFile(filePath, JSON.stringify(pkg, null, 2) + "\n", ctx.dryRun);
  }

  return { added };
}
