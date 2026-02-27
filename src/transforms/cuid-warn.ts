import type { FileInfo, API } from "jscodeshift";

/**
 * Detects cuid() and isCuid() usage and emits warnings.
 * Does NOT modify any files — returns undefined always.
 *
 * AdonisJS v7 removes cuid support entirely. Users must
 * replace with crypto.randomUUID() or another UUID library.
 */
export default function transform(
  fileInfo: FileInfo,
  api: API,
  options?: Record<string, unknown>,
): undefined {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  const CUID_NAMES = ["cuid", "isCuid"];

  // Check if any of these are imported from an adonis/cuid package
  let hasCuidImport = false;
  root.find(j.ImportDeclaration).forEach((path) => {
    const source = String(path.node.source.value);
    if (
      source.includes("cuid") ||
      source.includes("@adonisjs/core/helpers") // cuid was in helpers in v6
    ) {
      const specifiers = path.node.specifiers ?? [];
      for (const spec of specifiers) {
        if (spec.type === "ImportSpecifier") {
          const name: string =
            typeof spec.imported.name === "string"
              ? spec.imported.name
              : ((spec.imported as any).value as string);
          if (CUID_NAMES.includes(name)) hasCuidImport = true;
        }
      }
    }
  });

  // Also check for call expressions regardless of import (might use global or re-export)
  root
    .find(j.CallExpression)
    .filter((path) => {
      const callee = path.node.callee;
      return callee.type === "Identifier" && CUID_NAMES.includes(callee.name);
    })
    .forEach((path) => {
      const callee = path.node.callee;
      const name = callee.type === "Identifier" ? callee.name : "cuid";
      const line = path.node.loc?.start.line;
      api.report(
        `CUID_USAGE:${line ?? "?"}:${name}() usage detected. ` +
          `AdonisJS v7 removes cuid support. ` +
          `Replace with crypto.randomUUID() or your preferred UUID library.`,
      );
    });

  if (hasCuidImport) {
    api.report(
      `CUID_IMPORT:?:cuid import from @adonisjs/core/helpers detected. ` +
        `Remove this import and replace cuid() / isCuid() calls manually.`,
    );
  }

  return undefined;
}

export const parser = "ts";
