/**
 * Cross-platform utilities for Windows/Unix compatibility.
 * Consolidates all platform-specific logic in one place.
 */

import { spawn, spawnSync } from 'child_process';
import fs from 'fs';

/** True if running on Windows */
export const IS_WINDOWS = process.platform === 'win32';

/** Platform-specific timing constants */
export const PLATFORM_TIMEOUTS = {
  /** Time for dev servers to fully start */
  serverStartup: IS_WINDOWS ? 8000 : 3000,
  /** Time for processes to terminate */
  processCleanup: IS_WINDOWS ? 1000 : 500,
  /** Max attempts to check if server is ready */
  serverReadyMaxAttempts: IS_WINDOWS ? 60 : 30,
  /** Delay between server ready checks */
  serverReadyCheckDelay: 500,
} as const;

/** Get the correct symlink type for the platform */
export function getSymlinkType(): 'junction' | 'dir' {
  // Use 'junction' on Windows (works without admin privileges)
  return IS_WINDOWS ? 'junction' : 'dir';
}

/**
 * Kill a process and all its children.
 * Uses taskkill on Windows, pkill/kill on Unix.
 */
export function killProcessTree(pid: number): void {
  try {
    if (IS_WINDOWS) {
      // On Windows, use taskkill to kill the entire process tree synchronously
      try {
        spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'pipe' });
      } catch {
        // Ignore errors (process may already be dead)
      }
    } else {
      // On Unix, kill child processes first, then parent
      try {
        const result = spawn('pkill', ['-TERM', '-P', String(pid)], { stdio: 'pipe' });
        result.on('close', () => {
          try {
            process.kill(pid, 'SIGTERM');
          } catch {
            // Ignore errors (process may already be dead)
          }
          // Force kill after delay if still alive
          setTimeout(() => {
            try {
              process.kill(pid, 'SIGKILL');
            } catch {
              // Ignore errors (process may already be dead)
            }
          }, 200);
        });
      } catch {
        // If pkill fails, just kill the parent process
        try {
          process.kill(pid, 'SIGTERM');
          setTimeout(() => {
            try {
              process.kill(pid, 'SIGKILL');
            } catch {
              // Ignore errors (process may already be dead)
            }
          }, 200);
        } catch {
          // Ignore errors (process may already be dead)
        }
      }
    }
  } catch {
    // Ignore errors (process may already be dead)
  }
}

/**
 * Wait for a specified duration.
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safely remove a directory with retry logic for Windows file locking issues.
 * On Windows, files may remain locked briefly after process termination.
 */
export async function safeRmDir(
  dir: string,
  options: { maxRetries?: number; delayMs?: number } = {}
): Promise<void> {
  const { maxRetries = 5, delayMs = 500 } = options;

  for (let i = 0; i < maxRetries; i++) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      return;
    } catch (e: any) {
      // EBUSY, ENOTEMPTY, EPERM are common Windows file locking errors
      if (e.code === 'EBUSY' || e.code === 'ENOTEMPTY' || e.code === 'EPERM') {
        await wait(delayMs);
      } else {
        throw e;
      }
    }
  }

  // Final attempt - don't throw on failure
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Silently ignore - cleanup is best-effort
  }
}

/**
 * Get Python-related paths for the current platform.
 */
export function getPythonPaths() {
  return {
    binDir: IS_WINDOWS ? 'Scripts' : 'bin',
    pythonExe: IS_WINDOWS ? 'python.exe' : 'python',
    pythonCmd: IS_WINDOWS ? 'python' : 'python3',
    venvBinDir: IS_WINDOWS ? '.venv\\Scripts' : '.venv/bin',
    exeExtension: IS_WINDOWS ? '.exe' : '',
  };
}
