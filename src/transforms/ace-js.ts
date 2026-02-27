import type { FileInfo, API } from "jscodeshift";

const OLD_IMPORTS = [
  "ts-node-maintained/register/esm",
  "ts-node/register/esm",
  "ts-node/esm",
  "@swc-node/register/esm-register",
];
const NEW_IMPORT = "@poppinss/ts-exec";

export default function transform(
  fileInfo: FileInfo,
  api: API,
  options?: Record<string, unknown>,
): string | undefined {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = false;

  root
    .find(j.ImportDeclaration)
    .filter((path) => {
      const val = path.node.source.value;
      return typeof val === "string" && OLD_IMPORTS.includes(val);
    })
    .forEach((path) => {
      path.node.source = j.stringLiteral(NEW_IMPORT);
      // Remove all specifiers (it's a side-effect import)
      path.node.specifiers = [];
      changed = true;
    });

  return changed ? root.toSource() : undefined;
}

export const parser = "babel";
