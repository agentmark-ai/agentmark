/**
 * Type definitions for existing repository initialization.
 * These types support project detection, conflict resolution, and package manager handling.
 */

/** Supported package managers for TypeScript projects */
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

/** Configuration for a specific package manager */
export interface PackageManagerConfig {
  /** Package manager name */
  name: PackageManager;
  /** Lock file that indicates this package manager is in use */
  lockFile: string;
  /** Command to install all dependencies */
  installCmd: string;
  /** Command to add a production dependency */
  addCmd: string;
  /** Command to add a dev dependency */
  addDevCmd: string;
  /** Command prefix for running scripts (e.g., 'npm run', 'yarn') */
  runCmd: string;
}

/** Package manager configurations indexed by lock file name */
export const PACKAGE_MANAGERS: Record<string, PackageManagerConfig> = {
  'yarn.lock': {
    name: 'yarn',
    lockFile: 'yarn.lock',
    installCmd: 'yarn install',
    addCmd: 'yarn add',
    addDevCmd: 'yarn add --dev',
    runCmd: 'yarn',
  },
  'pnpm-lock.yaml': {
    name: 'pnpm',
    lockFile: 'pnpm-lock.yaml',
    installCmd: 'pnpm install',
    addCmd: 'pnpm add',
    addDevCmd: 'pnpm add --save-dev',
    runCmd: 'pnpm',
  },
  'bun.lockb': {
    name: 'bun',
    lockFile: 'bun.lockb',
    installCmd: 'bun install',
    addCmd: 'bun add',
    addDevCmd: 'bun add --dev',
    runCmd: 'bun run',
  },
  'package-lock.json': {
    name: 'npm',
    lockFile: 'package-lock.json',
    installCmd: 'npm install',
    addCmd: 'npm install',
    addDevCmd: 'npm install --save-dev',
    runCmd: 'npm run',
  },
};

/** Default package manager when no lock file is found */
export const DEFAULT_PACKAGE_MANAGER: PackageManagerConfig = PACKAGE_MANAGERS['package-lock.json']!;

/** Information about a detected Python virtual environment */
export interface PythonVenvInfo {
  /** Absolute path to the venv directory */
  path: string;
  /** Relative name (e.g., '.venv' or 'venv') */
  name: string;
  /** Platform-specific activate command */
  activateCmd: string;
  /** Platform-specific pip path */
  pipPath: string;
}

/** Type of file for determining merge strategy */
export type FileType = 'config' | 'source' | 'directory' | 'dotfile';

/** Resolution strategy for a conflicting file */
export type ConflictStrategy = 'merge' | 'append' | 'prompt' | 'skip';

/** Represents a file that may conflict with AgentMark initialization */
export interface ConflictFile {
  /** Relative path from project root */
  path: string;
  /** Type of file for determining merge strategy */
  type: FileType;
  /** Recommended resolution strategy */
  strategy: ConflictStrategy;
}

/** Files that may conflict with AgentMark initialization */
export const CONFLICT_FILES: ConflictFile[] = [
  { path: 'agentmark.json', type: 'config', strategy: 'prompt' },
  { path: 'agentmark', type: 'directory', strategy: 'prompt' },
  { path: 'agentmark.client.ts', type: 'source', strategy: 'prompt' },
  { path: 'agentmark_client.py', type: 'source', strategy: 'prompt' },
  { path: '.gitignore', type: 'dotfile', strategy: 'append' },
  { path: '.env', type: 'dotfile', strategy: 'append' },
  { path: 'package.json', type: 'config', strategy: 'merge' },
  { path: 'index.ts', type: 'source', strategy: 'skip' },
  { path: 'main.py', type: 'source', strategy: 'skip' },
  { path: 'tsconfig.json', type: 'config', strategy: 'skip' },
  { path: 'pyproject.toml', type: 'config', strategy: 'skip' },
];

/** User's resolution choice for a conflict */
export type ConflictAction = 'skip' | 'overwrite' | 'merge';

/** A conflict resolution decision from the user */
export interface ConflictResolution {
  /** Path to the conflicting file */
  path: string;
  /** Action chosen by the user */
  action: ConflictAction;
}

/** Detected information about an existing project */
export interface ProjectInfo {
  /** Whether any project indicators were found */
  isExistingProject: boolean;
  /** Detected project type */
  type: 'typescript' | 'python' | 'unknown';
  /** Detected package manager (for TypeScript projects) */
  packageManager: PackageManagerConfig;
  /** Files that exist and may conflict */
  conflictingFiles: ConflictFile[];
  /** Whether the agentmark/ directory already exists */
  hasAgentmarkDir: boolean;
  /** Whether an existing Python venv was detected */
  pythonVenv: PythonVenvInfo | null;
}

/** Result of a file merge operation */
export interface MergeResult {
  /** Whether the merge was successful */
  success: boolean;
  /** The merged content (if applicable) */
  content?: string;
  /** Any warnings generated during merge */
  warnings: string[];
  /** What was added (for user feedback) */
  added: string[];
  /** What was skipped (already present) */
  skipped: string[];
}

/** Extended options for initialization in existing projects */
export interface InitOptions {
  /** Target directory path */
  targetPath: string;
  /** Selected language */
  language: 'typescript' | 'python';
  /** Selected adapter (TypeScript only) */
  adapter?: string;
  /** Deployment mode */
  deploymentMode: 'cloud' | 'static';
  /** API key (if provided) */
  apiKey?: string;
  /** IDE client for MCP setup */
  client: string;
  /** Detected project info (null if new project) */
  projectInfo: ProjectInfo | null;
  /** User's conflict resolutions */
  conflictResolutions: ConflictResolution[];
}
