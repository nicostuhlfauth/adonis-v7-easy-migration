import jscodeshift, { type API, type FileInfo } from "jscodeshift";
import { readFileSync, writeFileSync } from "node:fs";
import { globby } from "globby";
import type { TransformResult, Warning } from "../types.js";

type TransformFn = (
  fileInfo: FileInfo,
  api: API,
  options: Record<string, unknown>,
) => string | undefined | null;

interface TransformModule {
  default: TransformFn;
  parser?: string;
}

export async function runTransform(
  transformModule: TransformModule,
  globPatterns: string | string[],
  projectPath: string,
  dryRun: boolean,
  transformName: string,
  verbose: boolean,
): Promise<TransformResult> {
  const { default: transform, parser = "ts" } = transformModule;
  const j = jscodeshift.withParser(parser);

  const patterns = Array.isArray(globPatterns) ? globPatterns : [globPatterns];
  const files = await globby(patterns, { cwd: projectPath, absolute: true });

  const warnings: Warning[] = [];
  let filesChanged = 0;
  let filesUnchanged = 0;
  let filesErrored = 0;

  for (const filePath of files) {
    const source = readFileSync(filePath, "utf-8");
    try {
      const api: API = {
        j,
        jscodeshift: j,
        stats: () => {},
        report: (msg: string) => {
          warnings.push({
            file: filePath,
            message: msg,
            severity: "warn",
            actionRequired: false,
          });
        },
      };
      const result = transform({ source, path: filePath }, api, {});

      if (result == null || result === source) {
        filesUnchanged++;
        if (verbose) console.log(`  · unchanged: ${filePath}`);
      } else {
        filesChanged++;
        if (!dryRun) writeFileSync(filePath, result, "utf-8");
        if (verbose) console.log(`  ✓ changed:   ${filePath}`);
      }
    } catch (err) {
      filesErrored++;
      const message = err instanceof Error ? err.message : String(err);
      warnings.push({
        file: filePath,
        message: `Transform error: ${message}`,
        severity: "error",
        actionRequired: false,
      });
      if (verbose) console.error(`  ✗ error:     ${filePath} — ${message}`);
    }
  }

  return { transform: transformName, filesChanged, filesUnchanged, filesErrored, warnings };
}
