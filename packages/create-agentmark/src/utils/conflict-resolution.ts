/**
 * Conflict resolution utilities for handling existing files.
 * Prompts users for resolution when files would be overwritten.
 */

import prompts from 'prompts';
import type {
  ConflictFile,
  ConflictResolution,
  ConflictAction,
  ProjectInfo,
} from './types.js';

/**
 * Filter conflicts that require user prompting.
 * Returns only conflicts with 'prompt' strategy that actually exist.
 */
export function getPromptableConflicts(conflictingFiles: ConflictFile[]): ConflictFile[] {
  return conflictingFiles.filter((file) => file.strategy === 'prompt');
}

/**
 * Prompt user for resolution of a single conflict.
 */
async function promptForSingleConflict(
  conflict: ConflictFile
): Promise<ConflictResolution> {
  const typeLabel = conflict.type === 'directory' ? 'directory' : 'file';

  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: `${conflict.path} already exists. What would you like to do?`,
    choices: [
      {
        title: `Skip (keep existing ${typeLabel})`,
        value: 'skip',
        description: `Don't modify the existing ${typeLabel}`,
      },
      {
        title: 'Overwrite',
        value: 'overwrite',
        description: `Replace with new AgentMark ${typeLabel}`,
      },
    ],
    initial: 0, // Default to skip for safety
  });

  return {
    path: conflict.path,
    action: action as ConflictAction || 'skip',
  };
}

/**
 * Prompt user for resolution of all conflicts that require prompting.
 * Returns an array of resolution decisions.
 */
export async function promptForResolutions(
  conflictingFiles: ConflictFile[]
): Promise<ConflictResolution[]> {
  const promptableConflicts = getPromptableConflicts(conflictingFiles);

  if (promptableConflicts.length === 0) {
    return [];
  }

  console.log('\n⚠️  Found existing files that may conflict with AgentMark initialization:\n');

  const resolutions: ConflictResolution[] = [];

  for (const conflict of promptableConflicts) {
    const resolution = await promptForSingleConflict(conflict);
    resolutions.push(resolution);
  }

  console.log(''); // Add blank line after prompts
  return resolutions;
}

/**
 * Get the resolution action for a specific file path.
 * Returns the user's choice or the default strategy if no prompt was needed.
 */
export function getResolutionAction(
  filePath: string,
  resolutions: ConflictResolution[],
  conflictingFiles: ConflictFile[]
): ConflictAction {
  // First check if user provided a resolution
  const userResolution = resolutions.find((r) => r.path === filePath);
  if (userResolution) {
    return userResolution.action;
  }

  // Check the default strategy for this file
  const conflictFile = conflictingFiles.find((f) => f.path === filePath);
  if (conflictFile) {
    // Map strategy to action
    switch (conflictFile.strategy) {
      case 'skip':
        return 'skip';
      case 'merge':
        return 'merge';
      case 'append':
        return 'merge'; // Append is a form of merge
      case 'prompt':
        // If we got here without a resolution, default to skip for safety
        return 'skip';
    }
  }

  // Default: overwrite (file doesn't conflict or isn't tracked)
  return 'overwrite';
}

/**
 * Check if a file should be skipped based on resolutions.
 */
export function shouldSkipFile(
  filePath: string,
  projectInfo: ProjectInfo | null,
  resolutions: ConflictResolution[]
): boolean {
  if (!projectInfo || !projectInfo.isExistingProject) {
    return false;
  }

  const action = getResolutionAction(filePath, resolutions, projectInfo.conflictingFiles);
  return action === 'skip';
}

/**
 * Check if a file should be merged based on resolutions.
 */
export function shouldMergeFile(
  filePath: string,
  projectInfo: ProjectInfo | null,
  resolutions: ConflictResolution[]
): boolean {
  if (!projectInfo || !projectInfo.isExistingProject) {
    return false;
  }

  const action = getResolutionAction(filePath, resolutions, projectInfo.conflictingFiles);
  return action === 'merge';
}

/**
 * Display a summary of existing project detection.
 */
export function displayProjectDetectionSummary(projectInfo: ProjectInfo): void {
  if (!projectInfo.isExistingProject) {
    return;
  }

  console.log('\n📁 Detected existing project:');
  console.log(`   Type: ${projectInfo.type}`);

  if (projectInfo.type === 'typescript') {
    console.log(`   Package Manager: ${projectInfo.packageManager.name}`);
  }

  if (projectInfo.pythonVenv) {
    console.log(`   Python Venv: ${projectInfo.pythonVenv.name}`);
  }

  if (projectInfo.hasAgentmarkDir) {
    console.log('   ⚠️  AgentMark directory already exists');
  }

  console.log('');
}
