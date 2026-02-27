import type { FileInfo, API } from "jscodeshift";

const HELPERS_SOURCE = "@adonisjs/core/helpers";
const STRING_HELPERS_SOURCE = "@adonisjs/core/helpers/string";
const PARSE_IMPORTS_SOURCE = "parse-imports";

/**
 * Renames removed helpers from @adonisjs/core/helpers:
 *
 * - getDirname()   → import.meta.dirname
 * - getFilename()  → import.meta.filename
 * - slash(x)       → stringHelpers.toUnixSlash(x)
 * - joinToURL(a,b) → new URL(b, a)
 * - parseImports   → import from 'parse-imports' directly
 */
export default function transform(
  fileInfo: FileInfo,
  api: API,
  options?: Record<string, unknown>,
): string | undefined {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = false;

  // Track which helpers we find imported
  const imported: {
    getDirname?: string;
    getFilename?: string;
    slash?: string;
    joinToURL?: string;
    parseImports?: string;
  } = {};

  // Find imports from @adonisjs/core/helpers and collect local names
  root.find(j.ImportDeclaration, { source: { value: HELPERS_SOURCE } }).forEach((path) => {
    const specifiersToRemove: string[] = [];

    for (const spec of path.node.specifiers ?? []) {
      if (spec.type !== "ImportSpecifier") continue;
      const importedName =
        typeof spec.imported.name === "string"
          ? spec.imported.name
          : ((spec.imported as any).value as string);
      const localName: string =
        (typeof spec.local?.name === "string" ? spec.local.name : undefined) ?? importedName;

      if (importedName === "getDirname") {
        imported.getDirname = localName;
        specifiersToRemove.push(importedName);
      } else if (importedName === "getFilename") {
        imported.getFilename = localName;
        specifiersToRemove.push(importedName);
      } else if (importedName === "slash") {
        imported.slash = localName;
        specifiersToRemove.push(importedName);
      } else if (importedName === "joinToURL") {
        imported.joinToURL = localName;
        specifiersToRemove.push(importedName);
      } else if (importedName === "parseImports") {
        imported.parseImports = localName;
        specifiersToRemove.push(importedName);
      }
    }

    if (specifiersToRemove.length > 0) {
      // Remove matched specifiers from the import
      path.node.specifiers = (path.node.specifiers ?? []).filter((s) => {
        if (s.type !== "ImportSpecifier") return true;
        const name =
          typeof s.imported.name === "string"
            ? s.imported.name
            : ((s.imported as any).value as string);
        return !specifiersToRemove.includes(name);
      });
      // If no specifiers remain, remove the entire import declaration
      if ((path.node.specifiers ?? []).length === 0) {
        j(path).remove();
      }
      changed = true;
    }
  });

  if (Object.keys(imported).length === 0) return undefined;

  // --- getDirname() → import.meta.dirname ---
  if (imported.getDirname) {
    const name = imported.getDirname;
    root
      .find(j.CallExpression, {
        callee: { type: "Identifier", name },
      })
      .forEach((path) => {
        j(path).replaceWith(
          j.memberExpression(
            j.metaProperty(j.identifier("import"), j.identifier("meta")),
            j.identifier("dirname"),
          ),
        );
      });
  }

  // --- getFilename() → import.meta.filename ---
  if (imported.getFilename) {
    const name = imported.getFilename;
    root
      .find(j.CallExpression, {
        callee: { type: "Identifier", name },
      })
      .forEach((path) => {
        j(path).replaceWith(
          j.memberExpression(
            j.metaProperty(j.identifier("import"), j.identifier("meta")),
            j.identifier("filename"),
          ),
        );
      });
  }

  // --- slash(x) → stringHelpers.toUnixSlash(x) ---
  if (imported.slash) {
    const name = imported.slash;
    let usageCount = 0;
    root
      .find(j.CallExpression, {
        callee: { type: "Identifier", name },
      })
      .forEach((path) => {
        j(path).replaceWith(
          j.callExpression(
            j.memberExpression(j.identifier("stringHelpers"), j.identifier("toUnixSlash")),
            path.node.arguments,
          ),
        );
        usageCount++;
      });

    if (usageCount > 0) {
      // Add import for stringHelpers if not present
      const hasStringHelpers =
        root.find(j.ImportDeclaration, {
          source: { value: STRING_HELPERS_SOURCE },
        }).length > 0;

      if (!hasStringHelpers) {
        root
          .find(j.Program)
          .get("body", 0)
          .insertBefore(
            j.importDeclaration(
              [j.importSpecifier(j.identifier("string"), j.identifier("stringHelpers"))],
              j.stringLiteral(STRING_HELPERS_SOURCE),
            ),
          );
      }
    }
  }

  // --- joinToURL(base, path) → new URL(path, base) ---
  if (imported.joinToURL) {
    const name = imported.joinToURL;
    root
      .find(j.CallExpression, {
        callee: { type: "Identifier", name },
      })
      .forEach((path) => {
        const args = path.node.arguments;
        // joinToURL(base, path) → new URL(path, base): arguments are swapped
        const newArgs = args.length >= 2 ? [args[1], args[0]] : args;
        j(path).replaceWith(j.newExpression(j.identifier("URL"), newArgs));
      });
  }

  // --- parseImports → add direct import from 'parse-imports' ---
  if (imported.parseImports) {
    const localName = imported.parseImports;
    // The call sites stay the same; we just need to add the new import
    const hasParseImports =
      root.find(j.ImportDeclaration, {
        source: { value: PARSE_IMPORTS_SOURCE },
      }).length > 0;

    if (!hasParseImports) {
      root
        .find(j.Program)
        .get("body", 0)
        .insertBefore(
          j.importDeclaration(
            [j.importDefaultSpecifier(j.identifier(localName))],
            j.stringLiteral(PARSE_IMPORTS_SOURCE),
          ),
        );
    }
  }

  return changed ? root.toSource() : undefined;
}

export const parser = "ts";
