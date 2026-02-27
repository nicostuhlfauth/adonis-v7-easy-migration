export interface MigrationContext {
  projectPath: string;
  dryRun: boolean;
  verbose: boolean;
  skipInstall: boolean;
  packageJson: Record<string, any>;
  installedPackages: InstalledPackages;
}

export interface InstalledPackages {
  hasInertia: boolean;
  hasBouncer: boolean;
  hasTuyau: boolean;
  hasVite: boolean;
  hasArgon2: boolean;
  hasEdge: boolean;
  inertiaFramework?: "react" | "vue" | "svelte" | "solid";
  packageManager: "npm" | "yarn" | "pnpm" | "bun";
}

export interface TransformResult {
  transform: string;
  filesChanged: number;
  filesUnchanged: number;
  filesErrored: number;
  warnings: Warning[];
}

export interface Warning {
  file: string;
  line?: number;
  message: string;
  severity: "info" | "warn" | "error";
  actionRequired: boolean;
}

export interface PackageChange {
  name: string;
  action: "add" | "remove" | "update";
  dev?: boolean;
}

export interface MigrationReport {
  results: TransformResult[];
  allWarnings: Warning[];
  packageChanges: PackageChange[];
  newFiles: string[];
  skippedFiles: string[];
}
