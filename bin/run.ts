#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { intro, outro, cancel } from "@clack/prompts";
import { Runner } from "../src/runner.js";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "dry-run": { type: "boolean", short: "d", default: false },
    verbose: { type: "boolean", short: "v", default: false },
    "skip-install": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`
adonis-v7-easy-migration — Automated migration from AdonisJS v6 to v7

USAGE
  node build/bin/run.js [project-path] [options]

ARGUMENTS
  project-path    Path to your AdonisJS v6 project (default: current directory)

OPTIONS
  -d, --dry-run       Preview all changes without modifying any files
  -v, --verbose       Print every file processed by each transform
  --skip-install      Skip running the package manager after file changes
  -h, --help          Show this help message

EXAMPLES
  # Run in the current directory
  node build/bin/run.js

  # Run against a specific project
  node build/bin/run.js /path/to/my-adonis-app

  # Preview changes first
  node build/bin/run.js --dry-run
`);
  process.exit(0);
}

const projectPath = resolve(positionals[0] ?? process.cwd());

intro("AdonisJS v6 → v7 Migration Tool");
console.log(`  Project: ${projectPath}\n`);

process.on("SIGINT", () => {
  cancel("Migration cancelled.");
  process.exit(0);
});

const runner = new Runner({
  projectPath,
  dryRun: values["dry-run"] ?? false,
  verbose: values.verbose ?? false,
  skipInstall: values["skip-install"] ?? false,
});

try {
  await runner.run();
  outro("Done!");
} catch (err) {
  console.error("\nMigration failed with an unexpected error:");
  console.error(err);
  process.exit(1);
}
