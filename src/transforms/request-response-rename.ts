import type { FileInfo, API } from "jscodeshift";

const HTTP_SOURCE = "@adonisjs/core/http";

const RENAMES: Record<string, string> = {
  Request: "HttpRequest",
  Response: "HttpResponse",
};

/**
 * Renames AdonisJS Request/Response to HttpRequest/HttpResponse to avoid
 * conflicts with native platform classes.
 *
 * Handles three patterns:
 * 1. Named import specifiers:  import { Request } → import { HttpRequest }
 * 2. Static method calls:      Request.macro()   → HttpRequest.macro()
 * 3. Module augmentation:      interface Request → interface HttpRequest
 *    (inside `declare module '@adonisjs/core/http'`)
 */
export default function transform(
  fileInfo: FileInfo,
  api: API,
  options?: Record<string, unknown>,
): string | undefined {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = false;

  // Map from local name → new name, for each renamed import
  const renamedLocals = new Map<string, string>();

  // 1. Rename import specifiers
  root.find(j.ImportDeclaration, { source: { value: HTTP_SOURCE } }).forEach((path) => {
    for (const spec of path.node.specifiers ?? []) {
      if (spec.type !== "ImportSpecifier") continue;
      const importedName: string =
        typeof spec.imported.name === "string"
          ? spec.imported.name
          : ((spec.imported as any).value as string);
      if (!(importedName in RENAMES)) continue;

      const newName = RENAMES[importedName];
      const localName: string =
        (typeof spec.local?.name === "string" ? spec.local!.name : undefined) ?? importedName;

      // Track the local name so we can rename usages
      renamedLocals.set(localName, newName);

      // Rename the imported identifier
      spec.imported = j.identifier(newName);
      // If local name matches the old imported name, rename it too
      if (spec.local?.name === importedName) {
        spec.local = j.identifier(newName);
      }
      changed = true;
    }
  });

  if (!changed) return undefined;

  // 2. Rename usages of the old local names (Identifiers, MemberExpressions)
  for (const [oldLocal, newLocal] of renamedLocals) {
    // Replace standalone Identifier references (excluding import specifiers)
    root
      .find(j.Identifier, { name: oldLocal })
      .filter((path) => {
        // Skip: already inside the import declaration we already handled
        if (path.parent.node.type === "ImportSpecifier") return false;
        // Skip: property access keys (e.g. obj.Request — only rename the object)
        if (
          path.parent.node.type === "MemberExpression" &&
          path.parent.node.property === path.node &&
          !path.parent.node.computed
        ) {
          return false;
        }
        return true;
      })
      .forEach((path) => {
        path.node.name = newLocal;
      });
  }

  // 3. Module augmentation: rename interface declarations inside
  //    `declare module '@adonisjs/core/http' { interface Request { ... } }`
  root
    .find(j.TSModuleDeclaration)
    .filter((path) => {
      const id = path.node.id;
      return id.type === "StringLiteral" && (id as any).value === HTTP_SOURCE;
    })
    .forEach((modPath) => {
      j(modPath)
        .find(j.TSInterfaceDeclaration)
        .forEach((ifacePath) => {
          const id = ifacePath.node.id as any;
          const oldName: string = id.name ?? id.value ?? "";
          if (oldName in RENAMES) {
            ifacePath.node.id = j.identifier(RENAMES[oldName]);
          }
        });
    });

  return root.toSource();
}

export const parser = "ts";
