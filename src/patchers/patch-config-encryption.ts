import { join } from "node:path";
import { fileExists, writeFile } from "../utils/fs.js";
import type { MigrationContext } from "../types.js";

const ENCRYPTION_CONFIG = `import env from '#start/env'
import { defineConfig, drivers } from '@adonisjs/core/encryption'

export default defineConfig({
  default: 'legacy',
  list: {
    legacy: drivers.legacy({
      keys: [env.get('APP_KEY')],
    }),
  },
})
`;

/**
 * Creates config/encryption.ts with the legacy driver configuration.
 * Skips if the file already exists.
 */
export function patchConfigEncryption(ctx: MigrationContext): {
  created: boolean;
  skipped: boolean;
} {
  const filePath = join(ctx.projectPath, "config", "encryption.ts");

  if (fileExists(filePath)) {
    return { created: false, skipped: true };
  }

  writeFile(filePath, ENCRYPTION_CONFIG, ctx.dryRun);
  return { created: true, skipped: false };
}
