# Data Model: Existing Repository Initialization

**Feature**: 006-existing-repo-init
**Date**: 2026-01-10

## Overview

This feature operates primarily on the file system and user prompts. The data model defines the TypeScript interfaces for project detection, conflict resolution, and package manager handling.

## Core Types

### ProjectInfo

Represents detected information about an existing project.

```typescript
interface ProjectInfo {
  /** Whether any project indicators were found */
  isExistingProject: boolean;

  /** Detected project type */
  type: 'typescript' | 'python' | 'unknown';

  /** Detected package manager (for TypeScript projects) */
  packageManager: PackageManager;

  /** Files that exist and may conflict */
  conflictingFiles: ConflictFile[];

  /** Whether the agentmark/ directory already exists */
  hasAgentmarkDir: boolean;

  /** Whether an existing Python venv was detected */
  pythonVenv: PythonVenvInfo | null;
}
```

### PackageManager

Enum for supported package managers.

```typescript
type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

interface PackageManagerConfig {
  name: PackageManager;
  lockFile: string;
  installCmd: string;
  addCmd: string;
  addDevCmd: string;
}

const PACKAGE_MANAGERS: Record<string, PackageManagerConfig> = {
  'yarn.lock': {
    name: 'yarn',
    lockFile: 'yarn.lock',
    installCmd: 'yarn install',
    addCmd: 'yarn add',
    addDevCmd: 'yarn add --dev',
  },
  'pnpm-lock.yaml': {
    name: 'pnpm',
    lockFile: 'pnpm-lock.yaml',
    installCmd: 'pnpm install',
    addCmd: 'pnpm add',
    addDevCmd: 'pnpm add --save-dev',
  },
  'bun.lockb': {
    name: 'bun',
    lockFile: 'bun.lockb',
    installCmd: 'bun install',
    addCmd: 'bun add',
    addDevCmd: 'bun add --dev',
  },
  'package-lock.json': {
    name: 'npm',
    lockFile: 'package-lock.json',
    installCmd: 'npm install',
    addCmd: 'npm install',
    addDevCmd: 'npm install --save-dev',
  },
};
```

### ConflictFile

Represents a file that may conflict with AgentMark initialization.

```typescript
interface ConflictFile {
  /** Relative path from project root */
  path: string;

  /** Type of file for determining merge strategy */
  type: 'config' | 'source' | 'directory' | 'dotfile';

  /** Recommended resolution strategy */
  strategy: 'merge' | 'append' | 'prompt' | 'skip';
}

const CONFLICT_FILES: ConflictFile[] = [
  { path: 'agentmark.json', type: 'config', strategy: 'prompt' },
  { path: 'agentmark/', type: 'directory', strategy: 'prompt' },
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
```

### ConflictResolution

User's resolution choice for a conflict.

```typescript
type ConflictAction = 'skip' | 'overwrite' | 'merge';

interface ConflictResolution {
  path: string;
  action: ConflictAction;
}
```

### PythonVenvInfo

Information about detected Python virtual environment.

```typescript
interface PythonVenvInfo {
  /** Path to the venv directory */
  path: string;

  /** Relative name (e.g., '.venv' or 'venv') */
  name: string;

  /** Platform-specific activate command */
  activateCmd: string;

  /** Platform-specific pip path */
  pipPath: string;
}
```

### MergeResult

Result of a file merge operation.

```typescript
interface MergeResult {
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
```

### InitOptions

Extended options for initialization in existing projects.

```typescript
interface InitOptions {
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
```

## State Transitions

### Initialization Flow

```
[Start]
    |
    v
[Detect Project] --> ProjectInfo
    |
    v
[Check Conflicts] --> ConflictFile[]
    |
    v
[Prompt for Resolutions] --> ConflictResolution[]
    |
    v
[Execute with Resolutions] --> InitOptions
    |
    v
[Generate/Merge Files]
    |
    v
[Install Dependencies]
    |
    v
[Display Next Steps]
    |
    v
[End]
```

## Validation Rules

### Package.json Merge
- MUST preserve all existing `dependencies`
- MUST preserve all existing `devDependencies`
- MUST preserve all existing `scripts`
- MUST add AgentMark scripts with namespace prefix if conflict exists
- MUST NOT modify `name`, `version`, or other metadata fields

### .gitignore Append
- MUST NOT add entries already present (check with/without trailing slashes)
- MUST add entries at end of file
- MUST preserve existing formatting and comments

### .env Append
- MUST NOT overwrite existing keys
- MUST add new keys at end of file
- MUST preserve existing comments
- MUST add comment header for AgentMark section

## File System Operations

All file operations must be:
1. **Atomic where possible** - Use write-to-temp-then-rename pattern
2. **Permission-checked** - Verify write access before attempting
3. **Error-handled** - Graceful failure with clear messages
4. **Cross-platform** - Use `path.join()`, handle both separators
