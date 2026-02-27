import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { InstalledPackages } from "./types.js";

export function detectInstalledPackages(projectPath: string): InstalledPackages {
  const pkgPath = join(projectPath, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const allDeps: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  };

  const has = (name: string) => name in allDeps;

  let inertiaFramework: InstalledPackages["inertiaFramework"] = undefined;
  if (has("@inertiajs/react")) inertiaFramework = "react";
  else if (has("@inertiajs/vue3")) inertiaFramework = "vue";
  else if (has("@inertiajs/svelte")) inertiaFramework = "svelte";
  else if (has("@inertiajs/solid")) inertiaFramework = "solid";

  let packageManager: InstalledPackages["packageManager"] = "pnpm";
  if (existsSync(join(projectPath, "bun.lockb")) || existsSync(join(projectPath, "bun.lock"))) {
    packageManager = "bun";
  } else if (existsSync(join(projectPath, "yarn.lock"))) {
    packageManager = "yarn";
  } else if (existsSync(join(projectPath, "package-lock.json"))) {
    packageManager = "npm";
  }

  return {
    hasInertia: has("@adonisjs/inertia"),
    hasBouncer: has("@adonisjs/bouncer"),
    hasTuyau: has("@tuyau/core") || has("tuyau"),
    hasVite: has("@adonisjs/vite"),
    hasArgon2: has("argon2"),
    hasEdge: has("edge.js"),
    inertiaFramework,
    packageManager,
  };
}
