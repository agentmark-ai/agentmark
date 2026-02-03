/**
 * Constants for the update notifier module.
 */

/** Maximum time to wait for npm registry response (3 seconds) */
export const REQUEST_TIMEOUT_MS = 3000;

/** npm registry endpoint for version info */
export const NPM_REGISTRY_URL = 'https://registry.npmjs.org/-/package/@agentmark-ai/cli/dist-tags';

/** Package name for display in notifications */
export const PACKAGE_NAME = '@agentmark-ai/cli';

/** Environment variable to disable update checks */
export const DISABLE_UPDATE_CHECK_ENV = 'AGENTMARK_NO_UPDATE_NOTIFIER';
