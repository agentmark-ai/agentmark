/**
 * Update notifier module - checks for CLI updates and displays notifications.
 *
 * @module update-notifier
 */

// Re-export types
export type { UpdateInfo, UpdateCheckResult } from './types';

// Re-export constants
export {
  REQUEST_TIMEOUT_MS,
  NPM_REGISTRY_URL,
  PACKAGE_NAME,
  DISABLE_UPDATE_CHECK_ENV,
} from './constants';

// Public API - checker functions
export {
  startUpdateCheck,
  isUpdateCheckDisabled,
  isNewerVersion,
  getCurrentVersion,
  fetchLatestVersion,
} from './checker';

// Public API - display functions
export {
  displayUpdateNotification,
  detectPackageManager,
} from './display';
export type { PackageManagerInfo } from './display';
