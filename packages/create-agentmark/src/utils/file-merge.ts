/**
 * File merge utilities for handling existing files during initialization.
 * Supports merging package.json, appending to .gitignore and .env files.
 */

import fs from 'fs-extra';
import path from 'path';
import type { MergeResult } from './types.js';

/**
 * Merge AgentMark dependencies and scripts into an existing package.json.
 * Preserves all existing content, only adds missing AgentMark entries.
 */
export function mergePackageJson(
  targetPath: string,
  agentmarkDeps: Record<string, string>,
  agentmarkDevDeps: Record<string, string>,
  agentmarkScripts: Record<string, string>
): MergeResult {
  const packageJsonPath = path.join(targetPath, 'package.json');
  const result: MergeResult = {
    success: false,
    warnings: [],
    added: [],
    skipped: [],
  };

  try {
    // Read existing package.json
    if (!fs.existsSync(packageJsonPath)) {
      result.warnings.push('No existing package.json found');
      return result;
    }

    const existing = fs.readJsonSync(packageJsonPath) as Record<string, unknown>;

    // Initialize sections if they don't exist
    if (!existing.dependencies) {
      existing.dependencies = {};
    }
    if (!existing.devDependencies) {
      existing.devDependencies = {};
    }
    if (!existing.scripts) {
      existing.scripts = {};
    }

    const deps = existing.dependencies as Record<string, string>;
    const devDeps = existing.devDependencies as Record<string, string>;
    const scripts = existing.scripts as Record<string, string>;

    // Add AgentMark dependencies (only if not already present)
    for (const [pkg, version] of Object.entries(agentmarkDeps)) {
      if (deps[pkg]) {
        result.skipped.push(`dependency: ${pkg} (already exists)`);
      } else {
        deps[pkg] = version;
        result.added.push(`dependency: ${pkg}@${version}`);
      }
    }

    // Add AgentMark devDependencies (only if not already present)
    for (const [pkg, version] of Object.entries(agentmarkDevDeps)) {
      if (devDeps[pkg]) {
        result.skipped.push(`devDependency: ${pkg} (already exists)`);
      } else {
        devDeps[pkg] = version;
        result.added.push(`devDependency: ${pkg}@${version}`);
      }
    }

    // Add AgentMark scripts (use namespace if conflict exists)
    for (const [scriptName, scriptCmd] of Object.entries(agentmarkScripts)) {
      if (scripts[scriptName]) {
        // Conflict - use namespaced script name
        const namespacedName = `agentmark:${scriptName}`;
        if (scripts[namespacedName]) {
          // Both the original and namespaced version exist - skip with warning
          result.skipped.push(`script: ${scriptName}`);
          result.warnings.push(
            `Script "${scriptName}" and "${namespacedName}" both already exist. Skipping.`
          );
        } else {
          scripts[namespacedName] = scriptCmd;
          result.added.push(`script: ${namespacedName} (namespaced due to conflict)`);
          result.warnings.push(
            `Script "${scriptName}" already exists. Added as "${namespacedName}" instead.`
          );
        }
      } else {
        scripts[scriptName] = scriptCmd;
        result.added.push(`script: ${scriptName}`);
      }
    }

    // Write merged package.json
    fs.writeJsonSync(packageJsonPath, existing, { spaces: 2 });

    result.success = true;
    result.content = JSON.stringify(existing, null, 2);
    return result;
  } catch (error) {
    result.warnings.push(`Error merging package.json: ${error}`);
    return result;
  }
}

/**
 * Append AgentMark entries to an existing .gitignore file.
 * Checks for duplicates before adding.
 */
export function appendGitignore(targetPath: string, entries: string[]): MergeResult {
  const gitignorePath = path.join(targetPath, '.gitignore');
  const result: MergeResult = {
    success: false,
    warnings: [],
    added: [],
    skipped: [],
  };

  try {
    let existingContent = '';

    if (fs.existsSync(gitignorePath)) {
      existingContent = fs.readFileSync(gitignorePath, 'utf-8');
    }

    // Parse existing entries (normalize trailing slashes)
    const existingEntries = new Set(
      existingContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.replace(/\/$/, '')) // Remove trailing slashes for comparison
    );

    const entriesToAdd: string[] = [];

    for (const entry of entries) {
      const normalizedEntry = entry.replace(/\/$/, '');
      if (existingEntries.has(normalizedEntry)) {
        result.skipped.push(entry);
      } else {
        entriesToAdd.push(entry);
        result.added.push(entry);
      }
    }

    if (entriesToAdd.length > 0) {
      // Add a header comment and the new entries
      let newContent = existingContent;

      // Ensure file ends with newline
      if (newContent && !newContent.endsWith('\n')) {
        newContent += '\n';
      }

      // Add blank line if file has content
      if (newContent.trim()) {
        newContent += '\n';
      }

      newContent += '# AgentMark\n';
      newContent += entriesToAdd.join('\n');
      newContent += '\n';

      fs.writeFileSync(gitignorePath, newContent);
      result.content = newContent;
    }

    result.success = true;
    return result;
  } catch (error) {
    result.warnings.push(`Error appending to .gitignore: ${error}`);
    return result;
  }
}

/**
 * Append AgentMark environment variables to an existing .env file.
 * Does not overwrite existing keys.
 */
export function appendEnv(
  targetPath: string,
  envVars: Record<string, string>
): MergeResult {
  const envPath = path.join(targetPath, '.env');
  const result: MergeResult = {
    success: false,
    warnings: [],
    added: [],
    skipped: [],
  };

  try {
    let existingContent = '';

    if (fs.existsSync(envPath)) {
      existingContent = fs.readFileSync(envPath, 'utf-8');
    }

    // Parse existing keys
    const existingKeys = new Set<string>();
    const lines = existingContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=/);
        if (match && match[1]) {
          existingKeys.add(match[1]);
        }
      }
    }

    const varsToAdd: Array<[string, string]> = [];

    for (const [key, value] of Object.entries(envVars)) {
      if (existingKeys.has(key)) {
        result.skipped.push(key);
      } else {
        varsToAdd.push([key, value]);
        result.added.push(key);
      }
    }

    if (varsToAdd.length > 0) {
      let newContent = existingContent;

      // Ensure file ends with newline
      if (newContent && !newContent.endsWith('\n')) {
        newContent += '\n';
      }

      // Add blank line if file has content
      if (newContent.trim()) {
        newContent += '\n';
      }

      newContent += '# AgentMark\n';
      for (const [key, value] of varsToAdd) {
        newContent += `${key}=${value}\n`;
      }

      fs.writeFileSync(envPath, newContent);
      result.content = newContent;
    }

    result.success = true;
    return result;
  } catch (error) {
    result.warnings.push(`Error appending to .env: ${error}`);
    return result;
  }
}

/**
 * Check if a file should be skipped based on existing project detection.
 * Used for files like index.ts that should never be generated in existing projects.
 */
export function shouldSkipFile(
  fileName: string,
  isExistingProject: boolean,
  skipFiles: string[]
): boolean {
  if (!isExistingProject) {
    return false;
  }
  return skipFiles.includes(fileName);
}
