/**
 * Type definitions for the update notifier module.
 */

/**
 * Result of comparing current version to latest.
 */
export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

/**
 * Result of an update check operation.
 */
export type UpdateCheckResult =
  | { status: 'update-available'; info: UpdateInfo }
  | { status: 'up-to-date'; info: UpdateInfo }
  | { status: 'check-disabled' }
  | { status: 'check-failed' };
