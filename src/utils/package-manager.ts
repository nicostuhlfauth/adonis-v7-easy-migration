import { execa } from "execa";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { PackageChange, InstalledPackages } from "../types.js";

type PM = InstalledPackages["packageManager"];

interface WorkspaceInfo {
  root: string;
  packageName: string;
}

/**
 * Walk up from projectPath to find a pnpm workspace root.
 * Returns workspace info if found, otherwise null.
 */
function detectPnpmWorkspace(projectPath: string): WorkspaceInfo | null {
  const pkgJson = JSON.parse(readFileSync(join(projectPath, "package.json"), "utf-8"));
  const packageName: string = pkgJson.name ?? "";

  let dir = dirname(projectPath);
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return { root: dir, packageName };
    }
    dir = dirname(dir);
  }
  return null;
}

export function buildPackageChanges(installed: InstalledPackages): PackageChange[] {
  const changes: PackageChange[] = [];

  // Always remove old TS execution packages
  for (const pkg of ["ts-node", "ts-node-maintained", "@swc/core"]) {
    changes.push({ name: pkg, action: "remove" });
  }

  // Always add new TS execution + error handling packages
  changes.push({ name: "@poppinss/ts-exec", action: "add", dev: true });
  changes.push({ name: "youch", action: "add", dev: true });

  // Always update core AdonisJS packages
  const coreUpdates = [
    "@adonisjs/core",
    "@adonisjs/assembler",
    "@adonisjs/auth",
    "@adonisjs/lucid",
    "@adonisjs/session",
    "@adonisjs/static",
    "@adonisjs/shield",
    "@adonisjs/ally",
    "@adonisjs/mail",
    "@adonisjs/drive",
    "@adonisjs/i18n",
    "@adonisjs/limiter",
    "@adonisjs/redis",
    "@vinejs/vine",
    "@japa/plugin-adonisjs",
    "edge.js",
  ];
  for (const pkg of coreUpdates) {
    changes.push({ name: pkg, action: "update" });
  }

  // Conditional updates
  if (installed.hasInertia) changes.push({ name: "@adonisjs/inertia", action: "update" });
  if (installed.hasBouncer) changes.push({ name: "@adonisjs/bouncer", action: "update" });
  if (installed.hasTuyau) {
    changes.push({ name: "@tuyau/core", action: "update" });
    changes.push({ name: "@tuyau/utils", action: "update" });
  }
  if (installed.hasVite) changes.push({ name: "@adonisjs/vite", action: "update" });
  if (installed.hasArgon2) changes.push({ name: "argon2", action: "update" });

  return changes;
}

export async function applyPackageChanges(changes: PackageChange[], projectPath: string, pm: PM) {
  const toRemove = changes.filter((c) => c.action === "remove").map((c) => c.name);
  const toAddDev = changes.filter((c) => c.action === "add" && c.dev).map((c) => c.name);
  const toAddProd = changes.filter((c) => c.action === "add" && !c.dev).map((c) => c.name);
  const toUpdate = changes.filter((c) => c.action === "update").map((c) => `${c.name}@latest`);

  // Detect pnpm workspace — if found, run from root with --filter
  const workspace = pm === "pnpm" ? detectPnpmWorkspace(projectPath) : null;
  const execCwd = workspace ? workspace.root : projectPath;
  const filterArgs = workspace ? ["--filter", workspace.packageName] : [];

  // Always pass process.env so PATH is inherited and the PM binary can be found
  const execOpts = { cwd: execCwd, stdio: "inherit" as const, env: process.env };

  if (toRemove.length > 0) {
    await runRemove(pm, toRemove, filterArgs, execOpts);
  }
  if (toAddDev.length > 0) {
    await runAddDev(pm, toAddDev, filterArgs, execOpts);
  }
  if (toAddProd.length > 0) {
    await runAdd(pm, toAddProd, filterArgs, execOpts);
  }
  if (toUpdate.length > 0) {
    await runUpdate(pm, toUpdate, filterArgs, execOpts);
  }
}

type ExecOpts = { cwd: string; stdio: "inherit"; env: NodeJS.ProcessEnv };

async function runRemove(pm: PM, packages: string[], filterArgs: string[], opts: ExecOpts) {
  switch (pm) {
    case "yarn":
      await execa("yarn", ["remove", ...packages], opts);
      break;
    case "pnpm":
      await execa("pnpm", [...filterArgs, "remove", ...packages], opts);
      break;
    case "bun":
      await execa("bun", ["remove", ...packages], opts);
      break;
    default:
      await execa("npm", ["uninstall", ...packages], opts);
  }
}

async function runAddDev(pm: PM, packages: string[], filterArgs: string[], opts: ExecOpts) {
  switch (pm) {
    case "yarn":
      await execa("yarn", ["add", "--dev", ...packages], opts);
      break;
    case "pnpm":
      await execa("pnpm", [...filterArgs, "add", "--save-dev", ...packages], opts);
      break;
    case "bun":
      await execa("bun", ["add", "--dev", ...packages], opts);
      break;
    default:
      await execa("npm", ["install", "--save-dev", ...packages], opts);
  }
}

async function runAdd(pm: PM, packages: string[], filterArgs: string[], opts: ExecOpts) {
  switch (pm) {
    case "yarn":
      await execa("yarn", ["add", ...packages], opts);
      break;
    case "pnpm":
      await execa("pnpm", [...filterArgs, "add", ...packages], opts);
      break;
    case "bun":
      await execa("bun", ["add", ...packages], opts);
      break;
    default:
      await execa("npm", ["install", ...packages], opts);
  }
}

async function runUpdate(pm: PM, packages: string[], filterArgs: string[], opts: ExecOpts) {
  switch (pm) {
    case "yarn":
      await execa("yarn", ["add", ...packages], opts);
      break;
    case "pnpm":
      await execa("pnpm", [...filterArgs, "add", ...packages], opts);
      break;
    case "bun":
      await execa("bun", ["add", ...packages], opts);
      break;
    default:
      await execa("npm", ["install", ...packages], opts);
  }
}
