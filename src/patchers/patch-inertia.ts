import { join, dirname } from "node:path";
import { renameSync, mkdirSync } from "node:fs";
import { Project, SyntaxKind, ObjectLiteralExpression } from "ts-morph";
import { fileExists, writeFile, readFile } from "../utils/fs.js";
import type { MigrationContext, Warning } from "../types.js";

const INERTIA_MIDDLEWARE_CONTENT = `import { BaseInertiaMiddleware } from '@adonisjs/inertia'

export default class InertiaMiddleware extends BaseInertiaMiddleware {
  async handle(...args: ConstructorParameters<typeof BaseInertiaMiddleware['prototype']['handle']>) {
    return super.handle(...args)
  }
}
`;

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
 * Applies Inertia-specific migration steps:
 * 1. Move inertia/app/app.tsx → inertia/app.tsx
 * 2. Move inertia/app/ssr.tsx → inertia/ssr.tsx
 * 3. Update config/inertia.ts (remove entrypoint, encryptHistory, remove sharedData)
 * 4. Create app/middleware/inertia_middleware.ts
 * 5. Register middleware in start/kernel.ts
 */
export function patchInertia(ctx: MigrationContext): { changes: string[]; warnings: Warning[] } {
  const changes: string[] = [];
  const warnings: Warning[] = [];

  // 1 & 2: Move inertia files
  const fileMoves: Array<[string, string]> = [
    [
      join(ctx.projectPath, "inertia", "app", "app.tsx"),
      join(ctx.projectPath, "inertia", "app.tsx"),
    ],
    [
      join(ctx.projectPath, "inertia", "app", "ssr.tsx"),
      join(ctx.projectPath, "inertia", "ssr.tsx"),
    ],
  ];

  for (const [src, dest] of fileMoves) {
    if (fileExists(src)) {
      if (fileExists(dest)) {
        warnings.push({
          file: dest,
          message: `Destination already exists. Skipped moving ${src}`,
          severity: "warn",
          actionRequired: false,
        });
      } else {
        if (!ctx.dryRun) {
          mkdirSync(dirname(dest), { recursive: true });
          renameSync(src, dest);
        }
        changes.push(`Moved: ${src} → ${dest}`);
      }
    }
  }

  // 3: Update config/inertia.ts
  const inertiaConfigPath = join(ctx.projectPath, "config", "inertia.ts");
  if (fileExists(inertiaConfigPath)) {
    const result = patchInertiaConfig(inertiaConfigPath, ctx.dryRun);
    changes.push(...result.changes);
    warnings.push(...result.warnings);
  }

  // 4: Create middleware
  const middlewarePath = join(ctx.projectPath, "app", "middleware", "inertia_middleware.ts");
  if (!fileExists(middlewarePath)) {
    writeFile(middlewarePath, INERTIA_MIDDLEWARE_CONTENT, ctx.dryRun);
    changes.push(`Created: ${middlewarePath}`);
  } else {
    warnings.push({
      file: middlewarePath,
      message: "Inertia middleware already exists, skipped creation.",
      severity: "info",
      actionRequired: false,
    });
  }

  // 5: Register middleware in start/kernel.ts
  const kernelPath = join(ctx.projectPath, "start", "kernel.ts");
  if (fileExists(kernelPath)) {
    const registered = registerInertiaMiddleware(kernelPath, ctx.dryRun);
    if (registered) changes.push("Registered InertiaMiddleware in start/kernel.ts");
  }

  return { changes, warnings };
}

function patchInertiaConfig(
  configPath: string,
  dryRun: boolean,
): { changes: string[]; warnings: Warning[] } {
  const changes: string[] = [];
  const warnings: Warning[] = [];

  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPath(configPath);

  const defineConfigCall = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().getText() === "defineConfig");

  if (!defineConfigCall) return { changes, warnings };

  const configArg = defineConfigCall.getArguments()[0];
  if (!configArg || configArg.getKind() !== SyntaxKind.ObjectLiteralExpression) {
    return { changes, warnings };
  }

  const configObj = configArg as ObjectLiteralExpression;

  // Remove entrypoint
  const entrypointProp = configObj.getProperty("entrypoint");
  if (entrypointProp) {
    entrypointProp.remove();
    changes.push("config/inertia.ts: removed entrypoint property");
  }

  // Remove sharedData (manual action required)
  const sharedDataProp = configObj.getProperty("sharedData");
  if (sharedDataProp) {
    sharedDataProp.remove();
    changes.push("config/inertia.ts: removed sharedData property");
    warnings.push({
      file: configPath,
      message:
        "sharedData has been removed from Inertia config. " +
        "Move your shared data logic to the InertiaMiddleware.share() method. " +
        "See: https://docs.adonisjs.com/v6-to-v7#inertia",
      severity: "warn",
      actionRequired: true,
    });
  }

  // Replace history: { encrypt: true } → encryptHistory: true
  const historyProp = configObj.getProperty("history");
  if (historyProp) {
    const historyText = historyProp.getText();
    if (historyText.includes("encrypt") && historyText.includes("true")) {
      historyProp.replaceWithText("encryptHistory: true");
      changes.push("config/inertia.ts: replaced history.encrypt with encryptHistory");
    }
  }

  if (changes.length > 0 && !dryRun) {
    sourceFile.saveSync();
  }

  return { changes, warnings };
}

function registerInertiaMiddleware(kernelPath: string, dryRun: boolean): boolean {
  const content = readFile(kernelPath);

  if (content.includes("inertia_middleware")) return false;

  // Add import
  const importLine = `import InertiaMiddleware from '#middleware/inertia_middleware'\n`;

  // Find server.use( call and add our middleware
  const newContent = content
    .replace(/(import\s+\w+.*\n)(?=\nexport)/, `$1${importLine}`)
    .replace(/server\.use\(\[/, `server.use([\n  () => import('#middleware/inertia_middleware'),`);

  if (newContent !== content) {
    if (!dryRun) {
      import("node:fs").then(({ writeFileSync }) => writeFileSync(kernelPath, newContent, "utf-8"));
    }
    return true;
  }

  return false;
}
