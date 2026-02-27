import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, dirname, relative } from "node:path";

export function readFile(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

export function writeFile(filePath: string, content: string, dryRun: boolean) {
  if (!dryRun) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf-8");
  }
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

/**
 * Back up a set of files to `.adonis-migration-backup/` before modifying them.
 */
export function backupFiles(filePaths: string[], projectPath: string) {
  const backupDir = join(projectPath, ".adonis-migration-backup");
  mkdirSync(backupDir, { recursive: true });

  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue;
    const rel = relative(projectPath, filePath);
    const dest = join(backupDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(filePath, dest);
  }
}

/**
 * Recursively collect all files matching an extension in a directory.
 */
export function collectFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, extensions));
    } else if (extensions.some((ext) => full.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Perform a text-based search-and-replace across .edge template files.
 * Used for the `route()` → `urlFor()` rename since Edge templates are not valid JS/TS.
 */
export function replaceInEdgeFiles(
  projectPath: string,
  dryRun: boolean,
): { filesChanged: number; filesUnchanged: number } {
  const viewsDir = join(projectPath, "resources", "views");
  const files = collectFiles(viewsDir, [".edge"]);

  let filesChanged = 0;
  let filesUnchanged = 0;

  for (const filePath of files) {
    const original = readFileSync(filePath, "utf-8");
    // Replace route( with urlFor( but only as a standalone function call (not e.g. "aroute(")
    const updated = original.replace(/\broute\s*\(/g, "urlFor(");
    if (updated !== original) {
      filesChanged++;
      if (!dryRun) writeFileSync(filePath, updated, "utf-8");
    } else {
      filesUnchanged++;
    }
  }

  return { filesChanged, filesUnchanged };
}
