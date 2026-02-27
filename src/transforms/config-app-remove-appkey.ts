import type { FileInfo, API } from "jscodeshift";

/**
 * Removes `export const appKey = ...` from config/app.ts.
 * This export is no longer used in v7; encryption config is now in config/encryption.ts.
 */
export default function transform(
  fileInfo: FileInfo,
  api: API,
  options?: Record<string, unknown>,
): string | undefined {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = false;

  root
    .find(j.ExportNamedDeclaration, {
      declaration: {
        type: "VariableDeclaration",
      },
    })
    .filter((path) => {
      const decl = path.node.declaration;
      if (decl?.type !== "VariableDeclaration") return false;
      return decl.declarations.some(
        (d) =>
          d.type === "VariableDeclarator" && d.id.type === "Identifier" && d.id.name === "appKey",
      );
    })
    .forEach((path) => {
      const decl = path.node.declaration;
      if (decl?.type !== "VariableDeclaration") return;

      if (decl.declarations.length === 1) {
        // Only appKey in this declaration — remove the entire export statement
        j(path).remove();
        changed = true;
      } else {
        // Multiple declarators — remove only the appKey declarator
        decl.declarations = decl.declarations.filter(
          (d) =>
            !(
              d.type === "VariableDeclarator" &&
              d.id.type === "Identifier" &&
              d.id.name === "appKey"
            ),
        );
        changed = true;
      }
    });

  // Also handle: export { appKey } re-exports
  root
    .find(j.ExportNamedDeclaration, { declaration: null })
    .filter((path) => {
      return (path.node.specifiers ?? []).some(
        (s) => s.type === "ExportSpecifier" && (s.local as any).name === "appKey",
      );
    })
    .forEach((path) => {
      path.node.specifiers = (path.node.specifiers ?? []).filter(
        (s) => !(s.type === "ExportSpecifier" && (s.local as any).name === "appKey"),
      );
      if ((path.node.specifiers ?? []).length === 0) {
        j(path).remove();
      }
      changed = true;
    });

  return changed ? root.toSource() : undefined;
}

export const parser = "ts";
