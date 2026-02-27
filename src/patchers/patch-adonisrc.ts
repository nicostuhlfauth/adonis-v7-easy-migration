import { join } from "node:path";
import { Project, SyntaxKind, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { fileExists } from "../utils/fs.js";
import type { MigrationContext } from "../types.js";

const ASSEMBLER_HOOK_RENAMES: Record<string, string> = {
  onSourceFileChanged: "fileChanged",
  onDevServerStarted: "devServerStarted",
  onBuildCompleted: "buildFinished",
  onBuildStarting: "buildStarting",
};

/**
 * Patches adonisrc.ts to:
 * 1. Add hooks imports (@adonisjs/core + conditional)
 * 2. Add hooks property to defineConfig()
 * 3. Rename assembler hooks (onSourceFileChanged → fileChanged, etc.)
 * 4. Fix test glob patterns: (.ts|.js) → .{ts,js}
 * 5. Remove assetsBundler property
 */
export function patchAdonisrc(ctx: MigrationContext): { changed: boolean } {
  const filePath = join(ctx.projectPath, "adonisrc.ts");
  if (!fileExists(filePath)) return { changed: false };

  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPath(filePath);

  let changed = false;

  changed = addHooksImports(sourceFile, ctx) || changed;
  changed = addHooksToConfig(sourceFile, ctx) || changed;
  changed = renameAssemblerHooks(sourceFile) || changed;
  changed = fixTestGlobPatterns(sourceFile) || changed;
  changed = removeAssetsBundler(sourceFile) || changed;

  if (changed && !ctx.dryRun) {
    sourceFile.saveSync();
  }

  return { changed };
}

function addHooksImports(sourceFile: SourceFile, ctx: MigrationContext): boolean {
  let changed = false;
  const { installedPackages: pkg } = ctx;

  // Build list of required imports
  const imports: Array<{ names: string[]; from: string }> = [];

  // @adonisjs/core hooks
  const coreHookNames = ["indexEntities"];
  if (pkg.hasInertia) coreHookNames.push("indexPages");

  // Check if indexEntities is already imported
  const hasCoreHooksImport = sourceFile
    .getImportDeclarations()
    .some(
      (d) =>
        d.getModuleSpecifierValue() === "@adonisjs/core" &&
        d.getNamedImports().some((s) => s.getName() === "indexEntities"),
    );

  if (!hasCoreHooksImport) {
    imports.push({ names: coreHookNames, from: "@adonisjs/core" });
  }

  if (pkg.hasBouncer) {
    const hasBouncerImport = sourceFile
      .getImportDeclarations()
      .some(
        (d) =>
          d.getModuleSpecifierValue() === "@adonisjs/bouncer" &&
          d.getNamedImports().some((s) => s.getName() === "indexPolicies"),
      );
    if (!hasBouncerImport) {
      imports.push({ names: ["indexPolicies"], from: "@adonisjs/bouncer" });
    }
  }

  if (pkg.hasTuyau) {
    const hasTuyauImport = sourceFile
      .getImportDeclarations()
      .some(
        (d) =>
          d.getModuleSpecifierValue() === "@tuyau/core" &&
          d.getNamedImports().some((s) => s.getName() === "generateRegistry"),
      );
    if (!hasTuyauImport) {
      imports.push({ names: ["generateRegistry"], from: "@tuyau/core" });
    }
  }

  for (const imp of imports) {
    sourceFile.addImportDeclaration({
      namedImports: imp.names,
      moduleSpecifier: imp.from,
    });
    changed = true;
  }

  return changed;
}

function addHooksToConfig(sourceFile: SourceFile, ctx: MigrationContext): boolean {
  const { installedPackages: pkg } = ctx;

  // Find defineConfig call
  const defineConfigCall = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).find((c) => {
    const expr = c.getExpression();
    return expr.getText() === "defineConfig";
  });

  if (!defineConfigCall) return false;

  const configArg = defineConfigCall.getArguments()[0];
  if (!configArg || configArg.getKind() !== SyntaxKind.ObjectLiteralExpression) return false;

  const configObj = configArg as ObjectLiteralExpression;

  // Check if hooks already exists
  const existingHooks = configObj.getProperty("hooks");
  if (existingHooks) return false;

  // Build init array
  const initItems: string[] = ["indexEntities()"];
  if (pkg.hasBouncer) initItems.push("indexPolicies()");
  if (pkg.hasTuyau) initItems.push("generateRegistry()");
  if (pkg.hasInertia) {
    const framework = pkg.inertiaFramework ?? "react";
    initItems.push(`indexPages({ framework: '${framework}' })`);
  }

  const hookProps: string[] = [`init: [${initItems.join(", ")}]`];
  if (pkg.hasVite) {
    hookProps.push(`buildStarting: [() => import('@adonisjs/vite/build_hook')]`);
  }

  configObj.addPropertyAssignment({
    name: "hooks",
    initializer: `{ ${hookProps.join(", ")} }`,
  });

  return true;
}

function renameAssemblerHooks(sourceFile: SourceFile): boolean {
  let changed = false;

  // Find the defineConfig call's object argument and look for assembler property
  const defineConfigCall = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().getText() === "defineConfig");

  if (!defineConfigCall) return false;

  const configArg = defineConfigCall.getArguments()[0];
  if (!configArg || configArg.getKind() !== SyntaxKind.ObjectLiteralExpression) return false;

  const configObj = configArg as ObjectLiteralExpression;
  const assemblerProp = configObj.getProperty("assembler");

  if (!assemblerProp) return false;

  // Look for object literal in assembler value
  const assemblerObj = assemblerProp.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression).at(0);
  if (!assemblerObj) return false;

  for (const [oldName, newName] of Object.entries(ASSEMBLER_HOOK_RENAMES)) {
    const prop = assemblerObj.getProperty(oldName);
    if (prop) {
      // Use replaceWithText to rename the property key
      const propText = prop.getText();
      const renamed = propText.replace(new RegExp(`^${oldName}\\b`), newName);
      prop.replaceWithText(renamed);
      changed = true;
    }
  }

  return changed;
}

function fixTestGlobPatterns(sourceFile: SourceFile): boolean {
  let changed = false;

  // Find all string literals matching the old glob pattern (.ts|.js)
  sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral).forEach((node) => {
    const val = node.getLiteralValue();
    if (val.includes("(.ts|.js)")) {
      const newVal = val.replace(/\(\.ts\|\.js\)/g, ".{ts,js}");
      node.setLiteralValue(newVal);
      changed = true;
    }
    if (val.includes("(.ts|.tsx|.js|.jsx)")) {
      const newVal = val.replace(/\(\.ts\|\.tsx\|\.js\|\.jsx\)/g, ".{ts,tsx,js,jsx}");
      node.setLiteralValue(newVal);
      changed = true;
    }
  });

  return changed;
}

function removeAssetsBundler(sourceFile: SourceFile): boolean {
  const defineConfigCall = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().getText() === "defineConfig");

  if (!defineConfigCall) return false;

  const configArg = defineConfigCall.getArguments()[0];
  if (!configArg || configArg.getKind() !== SyntaxKind.ObjectLiteralExpression) return false;

  const configObj = configArg as ObjectLiteralExpression;
  const prop = configObj.getProperty("assetsBundler");

  if (prop) {
    prop.remove();
    return true;
  }

  return false;
}
