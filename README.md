# adonis-v7-easy-migration

A tool for automating the upgrade process of an **AdonisJS v6** project to **v7**.

> ⚠️ **Heads up:** This tool was built for a personal project and shared with the community as-is. Use it with responsibility. Feel free to contribute to improve it.

**Please make sure your project uses Node v24!**

---

## Quick Start

```bash
# 1. Clone this repository
git clone https://github.com/nicostuhlfauth/adonis-v7-easy-migration.git
cd adonis-v7-easy-migration

# 2. Install dependencies and build
pnpm install
pnpm run build

# 3. Run the migration tool against your project
node build/bin/run.js /path/to/your/adonis-project

# Or run from inside your project directory (no path argument needed)
cd /path/to/your/adonis-project
node /path/to/adonis-v7-easy-migration/build/bin/run.js

# Preview all changes without modifying files
node build/bin/run.js /path/to/your/adonis-project --dry-run
```

> **Tip:** Run inside a clean git branch so you can easily review the diff and revert if needed.

---

## Prerequisites

- Node.js 24 or higher
- An AdonisJS v6 project with `package.json`, `adonisrc.ts`, and `tsconfig.json`
- A git repository (strongly recommended — gives you a clean diff to review after the migration)

---

## What Gets Automated

| Breaking Change                                                               | Status                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------- |
| Replace `ts-node-maintained` with `@poppinss/ts-exec` in `ace.js`             | ✅ Automated                                  |
| Remove `appKey` export from `config/app.ts`                                   | ✅ Automated                                  |
| Create `config/encryption.ts` with legacy driver                              | ✅ Automated                                  |
| Add `hooks` to `adonisrc.ts` (`indexEntities`, Bouncer, Tuyau, Inertia, Vite) | ✅ Automated                                  |
| Rename assembler hooks (`onSourceFileChanged` → `fileChanged`, etc.)          | ✅ Automated                                  |
| Fix test glob patterns (`(.ts\|.js)` → `.{ts,js}`) in `adonisrc.ts`           | ✅ Automated                                  |
| Remove `assetsBundler` property from `adonisrc.ts`                            | ✅ Automated                                  |
| Replace `router.makeUrl()` with `urlFor()`                                    | ✅ Automated                                  |
| Replace `getDirname()` / `getFilename()` with `import.meta.dirname/filename`  | ✅ Automated                                  |
| Replace `slash(x)` with `stringHelpers.toUnixSlash(x)`                        | ✅ Automated                                  |
| Replace `joinToURL(a, b)` with `new URL(b, a)`                                | ✅ Automated                                  |
| Replace `parseImports` import with `parse-imports` package                    | ✅ Automated                                  |
| Rename `Request` / `Response` → `HttpRequest` / `HttpResponse`                | ✅ Automated                                  |
| Update flash message keys (`errors.*` → `inputErrorsBag.*`)                   | ✅ Automated                                  |
| Replace `route()` with `urlFor()` in Edge templates                           | ✅ Automated                                  |
| Add subpath imports to `package.json`                                         | ✅ Automated                                  |
| Update all `@adonisjs/*` packages to `@latest`                                | ✅ Automated                                  |
| Move `inertia/app/app.tsx` → `inertia/app.tsx` (if Inertia)                   | ✅ Automated (with confirmation)              |
| Create `InertiaMiddleware` and register in `start/kernel.ts`                  | ✅ Automated                                  |
| Create `tsconfig.inertia.json` with references                                | ✅ Automated                                  |
| Detect `cuid()` / `isCuid()` usage                                            | ⚠️ Warning only                               |
| Remove `sharedData` from Inertia config                                       | ⚠️ Removed + warning to migrate to middleware |

---

## What Requires Manual Action

After running the tool, check the report for any items flagged as manual:

### `cuid()` / `isCuid()` usage

AdonisJS v7 removes cuid support. Replace with:

```ts
// Simple unique ID
crypto.randomUUID();

// Or use a UUID library
import { v4 as uuidv4 } from "uuid";
```

### Inertia `sharedData` → Middleware

The `sharedData` property has been removed from `config/inertia.ts`.
Move your shared data logic into the generated `InertiaMiddleware`:

```ts
// app/middleware/inertia_middleware.ts
import { BaseInertiaMiddleware } from "@adonisjs/inertia";
import type { HttpContext } from "@adonisjs/core/http";

export default class InertiaMiddleware extends BaseInertiaMiddleware {
  share(ctx: HttpContext) {
    return {
      user: ctx.auth.user,
      // ... your shared data
    };
  }
}
```

### Behavioral Changes (review manually)

These are changes in runtime behavior that cannot be detected or transformed automatically:

- **`request.all()`** now merges multipart files with fields (previously returned fields only)
- **Auto-generated route names** from controllers may now conflict with manually defined route names
- **Status pages** (404, 500, etc.) are skipped for requests that expect a JSON response
- **VineJS `BaseModifiers` class** has been removed — update any custom modifier classes
- **Shutdown hooks** now execute in reverse registration order (last registered = first to run)

---

## Supported Optional Packages

The tool auto-detects which packages are installed and applies conditional transforms:

| Package             | What gets automated                                                 |
| ------------------- | ------------------------------------------------------------------- |
| `@adonisjs/inertia` | File moves, config update, middleware creation, tsconfig references |
| `@adonisjs/bouncer` | `indexPolicies()` hook added to `adonisrc.ts`                       |
| `@tuyau/core`       | `generateRegistry()` hook added to `adonisrc.ts`                    |
| `@adonisjs/vite`    | `buildStarting` hook added to `adonisrc.ts`                         |

---

## CLI Options

```
node build/bin/run.js [project-path] [options]

ARGUMENTS
  project-path    Path to your AdonisJS v6 project (default: current directory)

OPTIONS
  -d, --dry-run       Preview all changes without modifying any files
  -v, --verbose       Print every file processed by each transform
  --skip-install      Skip running the package manager after file changes
  -h, --help          Show this help message
```

---

## How It Works

The tool uses two strategies:

1. **jscodeshift codemods** — AST-level transformations for TypeScript/JavaScript files. These preserve your original formatting and only change exactly what needs to change.

2. **Structural patchers** — Direct file mutations for configuration files (`adonisrc.ts`, `tsconfig.json`, `package.json`) using ts-morph, where targeted surgical edits are easier than full AST rewrites.

A backup of all modified files is created in `.adonis-migration-backup/` before any changes are applied.

---

## After Migration

1. Review the migration report output
2. Address any `⚠ WARNINGS` flagged as manual actions
3. Review the behavioral changes list
4. Run `node ace` to verify the application starts
5. Run your test suite: `node ace test`

---

## Contributing

Found a missing transform or a bug? [Open an issue](https://github.com/nicostuhlfauth/adonis-v7-easy-migration/issues) or submit a PR.

To add a new transform:

1. Create `src/transforms/your-transform.ts` following the existing pattern
2. Add it to the execution sequence in `src/runner.ts`
3. Add unit tests in `tests/transforms/your-transform.spec.ts`
4. Update the table in this README

---

## License

MIT — see [LICENSE](./LICENSE)
