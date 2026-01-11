/**
 * Project detection utilities for identifying existing projects.
 * Detects TypeScript/Python projects and their configurations.
 */

import fs from 'fs-extra';
import path from 'path';
import {
  type ProjectInfo,
  type ConflictFile,
  type PythonVenvInfo,
  CONFLICT_FILES,
} from './types.js';
import { detectPackageManager } from './package-manager.js';

// Re-export for backwards compatibility
export { detectPackageManager };

const IS_WINDOWS = process.platform === 'win32';

/**
 * Detect if a TypeScript/Node.js project exists in the target directory.
 * Checks for package.json, tsconfig.json, or node_modules.
 */
export function detectTypeScriptProject(targetPath: string): boolean {
  const indicators = ['package.json', 'tsconfig.json', 'node_modules'];
  return indicators.some((file) => fs.existsSync(path.join(targetPath, file)));
}

/**
 * Detect if a Python project exists in the target directory.
 * Checks for pyproject.toml, requirements.txt, setup.py, or virtual environments.
 */
export function detectPythonProject(targetPath: string): boolean {
  const indicators = ['pyproject.toml', 'requirements.txt', 'setup.py', '.venv', 'venv'];
  return indicators.some((file) => fs.existsSync(path.join(targetPath, file)));
}

/**
 * Detect existing Python virtual environment.
 * Checks .venv and venv directories, returns platform-specific paths.
 */
export function detectPythonVenv(targetPath: string): PythonVenvInfo | null {
  const venvNames = ['.venv', 'venv'];

  for (const name of venvNames) {
    const venvPath = path.join(targetPath, name);
    if (fs.existsSync(venvPath) && fs.statSync(venvPath).isDirectory()) {
      // Check if it's actually a venv (has bin/Scripts and pyvenv.cfg or similar)
      const binDir = IS_WINDOWS ? 'Scripts' : 'bin';
      const binPath = path.join(venvPath, binDir);

      if (fs.existsSync(binPath)) {
        const pythonExe = IS_WINDOWS ? 'python.exe' : 'python';
        const pipExe = IS_WINDOWS ? 'pip.exe' : 'pip';

        return {
          path: venvPath,
          name,
          activateCmd: IS_WINDOWS
            ? `${name}\\Scripts\\activate`
            : `source ${name}/bin/activate`,
          pipPath: path.join(binPath, pipExe),
        };
      }
    }
  }

  // Check VIRTUAL_ENV environment variable
  const envVenv = process.env.VIRTUAL_ENV;
  if (envVenv && fs.existsSync(envVenv)) {
    const binDir = IS_WINDOWS ? 'Scripts' : 'bin';
    const pipExe = IS_WINDOWS ? 'pip.exe' : 'pip';
    const name = path.basename(envVenv);

    return {
      path: envVenv,
      name,
      activateCmd: IS_WINDOWS
        ? `${name}\\Scripts\\activate`
        : `source ${name}/bin/activate`,
      pipPath: path.join(envVenv, binDir, pipExe),
    };
  }

  return null;
}

/**
 * Detect files that may conflict with AgentMark initialization.
 * Returns only the files that actually exist in the target directory.
 */
export function detectConflictingFiles(targetPath: string): ConflictFile[] {
  const existingConflicts: ConflictFile[] = [];

  for (const conflictFile of CONFLICT_FILES) {
    const fullPath = path.join(targetPath, conflictFile.path);
    if (fs.existsSync(fullPath)) {
      existingConflicts.push(conflictFile);
    }
  }

  return existingConflicts;
}

/**
 * Detect all project information for the target directory.
 * This is the main function that combines all detection logic.
 */
export function detectProjectInfo(targetPath: string): ProjectInfo {
  const isTypeScript = detectTypeScriptProject(targetPath);
  const isPython = detectPythonProject(targetPath);
  const isExistingProject = isTypeScript || isPython;

  let type: 'typescript' | 'python' | 'unknown' = 'unknown';
  if (isTypeScript && !isPython) {
    type = 'typescript';
  } else if (isPython && !isTypeScript) {
    type = 'python';
  } else if (isTypeScript && isPython) {
    // If both, prefer TypeScript (more common case for polyglot projects)
    type = 'typescript';
  }

  const packageManager = detectPackageManager(targetPath);
  const conflictingFiles = detectConflictingFiles(targetPath);
  const hasAgentmarkDir = fs.existsSync(path.join(targetPath, 'agentmark'));
  const pythonVenv = detectPythonVenv(targetPath);

  return {
    isExistingProject,
    type,
    packageManager,
    conflictingFiles,
    hasAgentmarkDir,
    pythonVenv,
  };
}

/**
 * Check if the target path is the current directory.
 * Used to determine if we need to skip mkdir and cd instructions.
 */
export function isCurrentDirectory(folderName: string): boolean {
  return folderName === '.' || folderName === './' || folderName === '.\\';
}
