import type { FileInfo, API, ASTPath, CallExpression } from "jscodeshift";

const ROUTER_IMPORT = "@adonisjs/core/services/router";
const URL_BUILDER_IMPORT = "@adonisjs/core/services/url_builder";

/**
 * Transforms `router.makeUrl(...)` → `urlFor(...)` and updates imports.
 *
 * - Replaces the member expression call with a plain `urlFor()` call
 * - Adds `import { urlFor } from '@adonisjs/core/services/url_builder'`
 * - Removes the router import if it was only used for makeUrl
 */
export default function transform(
  fileInfo: FileInfo,
  api: API,
  options?: Record<string, unknown>,
): string | undefined {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = false;

  // Find the local name used for the router import (usually "router")
  let routerLocalName: string | null = null;
  root
    .find(j.ImportDefaultSpecifier)
    .filter((path) => {
      const decl = path.parent.node;
      return decl.type === "ImportDeclaration" && decl.source.value === ROUTER_IMPORT;
    })
    .forEach((path) => {
      const n = path.node.local?.name;
      routerLocalName = typeof n === "string" ? n : null;
    });

  if (!routerLocalName) return undefined;

  const localName = routerLocalName as string;

  // Find all router.makeUrl(...) calls
  const makeUrlCalls: ASTPath<CallExpression>[] = [];

  root
    .find(j.CallExpression, {
      callee: {
        type: "MemberExpression",
        object: { type: "Identifier", name: localName },
        property: { type: "Identifier", name: "makeUrl" },
      },
    })
    .forEach((path) => {
      makeUrlCalls.push(path);
      // Replace router.makeUrl(...args) with urlFor(...args)
      j(path).replaceWith(j.callExpression(j.identifier("urlFor"), path.node.arguments));
      changed = true;
    });

  if (!changed) return undefined;

  // Add urlFor import if not already present
  const hasUrlBuilderImport =
    root.find(j.ImportDeclaration, { source: { value: URL_BUILDER_IMPORT } }).length > 0;

  if (!hasUrlBuilderImport) {
    const urlForImport = j.importDeclaration(
      [j.importSpecifier(j.identifier("urlFor"))],
      j.stringLiteral(URL_BUILDER_IMPORT),
    );
    // Insert after the router import (or at the top if not found)
    const routerImport = root.find(j.ImportDeclaration, {
      source: { value: ROUTER_IMPORT },
    });
    if (routerImport.length > 0) {
      routerImport.at(0).insertAfter(urlForImport);
    } else {
      root.find(j.Program).get("body", 0).insertBefore(urlForImport);
    }
  }

  // Check if router is still used for anything else (e.g. router.get(), router.post())
  const remainingRouterUsages = root.find(j.MemberExpression, {
    object: { type: "Identifier", name: localName },
  }).length;

  if (remainingRouterUsages === 0) {
    // Safe to remove the router import
    root.find(j.ImportDeclaration, { source: { value: ROUTER_IMPORT } }).remove();
  }

  return root.toSource();
}

export const parser = "ts";
