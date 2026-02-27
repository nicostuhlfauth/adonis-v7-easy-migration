import type { FileInfo, API } from "jscodeshift";

/**
 * Renames flash message error keys from `errors.*` to `inputErrorsBag.*`.
 *
 * BEFORE: flashMessages.get('errors.email')
 * AFTER:  flashMessages.get('inputErrorsBag.email')
 *
 * Also handles: flashMessages.has('errors.*'), flashMessages.all() is left alone.
 */
export default function transform(
  fileInfo: FileInfo,
  api: API,
  options?: Record<string, unknown>,
): string | undefined {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = false;

  const FLASH_METHODS = ["get", "has", "getAll"];

  root
    .find(j.CallExpression, {
      callee: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "flashMessages" },
      },
    })
    .filter((path) => {
      const callee = path.node.callee;
      if (callee.type !== "MemberExpression") return false;
      const method = callee.property;
      return method.type === "Identifier" && FLASH_METHODS.includes(method.name);
    })
    .forEach((path) => {
      const firstArg = path.node.arguments[0];
      if (!firstArg) return;
      if (firstArg.type !== "StringLiteral" && firstArg.type !== "Literal") return;

      const val = String((firstArg as any).value);
      if (val.startsWith("errors.")) {
        const newVal = val.replace(/^errors\./, "inputErrorsBag.");
        (firstArg as any).value = newVal;
        if ("extra" in firstArg) {
          // recast preserves raw value; update it too
          (firstArg as any).extra = {
            rawValue: newVal,
            raw: JSON.stringify(newVal),
          };
        }
        changed = true;
      }
    });

  return changed ? root.toSource() : undefined;
}

export const parser = "ts";
