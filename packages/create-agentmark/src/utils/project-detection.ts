/**
 * Project detection for the minimal `npm create agentmark` init flow.
 *
 * Two questions only: "is this an existing project?" (drives whether we
 * run `git init`) and "does AgentMark already exist here?" (drives the
 * `agentmark.json` conflict prompt). Everything else — language, package
 * manager, Python venv, conflict file inventory — lives in the skill
 * workflow now, which can ask the docs MCP for current guidance instead
 * of encoding heuristics into the CLI.
 */

import fs from 'fs-extra';
import path from 'path';
import type { ProjectInfo } from './types.js';

const TYPESCRIPT_INDICATORS = ['package.json', 'tsconfig.json', 'node_modules'] as const;
const PYTHON_INDICATORS = ['pyproject.toml', 'requirements.txt', 'setup.py', '.venv', 'venv'] as const;

/** Any TypeScript/Node.js project marker present in the target directory. */
export function detectTypeScriptProject(targetPath: string): boolean {
  return TYPESCRIPT_INDICATORS.some((file) => fs.existsSync(path.join(targetPath, file)));
}

/** Any Python project marker present in the target directory. */
export function detectPythonProject(targetPath: string): boolean {
  return PYTHON_INDICATORS.some((file) => fs.existsSync(path.join(targetPath, file)));
}

/**
 * Combined detection. `isExistingProject` is true if either language's
 * markers are present; the init flow uses it only to decide whether to
 * run `git init`.
 */
export function detectProjectInfo(targetPath: string): ProjectInfo {
  return {
    isExistingProject: detectTypeScriptProject(targetPath) || detectPythonProject(targetPath),
    hasAgentmarkJson: fs.existsSync(path.join(targetPath, 'agentmark.json')),
    hasAgentmarkDir: fs.existsSync(path.join(targetPath, 'agentmark')),
  };
}

/**
 * True for any spelling of "current directory" the user might type at the
 * folder prompt. Used to skip mkdir/cd noise when the user wants to wire
 * AgentMark into the directory they're already in.
 */
export function isCurrentDirectory(folderName: string): boolean {
  return folderName === '.' || folderName === './' || folderName === '.\\';
}
