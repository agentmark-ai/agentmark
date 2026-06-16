/**
 * Cross-platform utilities for Windows/Unix compatibility.
 * Consolidates all platform-specific logic in one place.
 */

import path from 'path';
import { spawnSync } from 'child_process';
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
 * Kill a process and all its descendants (children, grandchildren, …).
 *
 * Windows uses `taskkill /T`, which is already tree-recursive. Unix walks the
 * tree leaf-first via `pgrep -P` and SIGKILLs each node. The walk MUST recurse:
 * a single `pkill -KILL -P <pid>` reaches only *direct* children, so any extra
 * process layer is orphaned. Concretely, `agentmark dev` spawns the webhook via
 * `tsx --watch`, which runs the dev-entry in its own worker subprocess — a
 * grandchild of `dev`. Killing only `dev`'s direct children left that worker
 * alive, leaking the webhook port (9417) after `doctor --smoke --boot` and
 * across repeated runs. Recursing kills the worker too.
 */
export function killProcessTree(pid: number): void {
  try {
    if (IS_WINDOWS) {
      // On Windows, taskkill /T kills the entire tree synchronously.
      try {
        spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'pipe' });
      } catch {
        // Ignore errors (process may already be dead)
      }
    } else {
      // spawnSync (not spawn) keeps this synchronous so ports are freed before
      // the caller returns, even when the caller exits right after teardown().
      killProcessTreeUnix(pid, new Set<number>());
    }
  } catch {
    // Ignore errors (process may already be dead)
  }
}

/** Direct child PIDs of `pid` on Unix (via `pgrep -P`); [] on any failure. */
function getChildPids(pid: number): number[] {
  try {
    const res = spawnSync('pgrep', ['-P', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(res.stdout || '')
      .split(/\s+/)
      .map(s => Number.parseInt(s, 10))
      .filter(n => Number.isInteger(n) && n > 0 && n !== pid);
  } catch {
    // pgrep may be missing or report "no process found" — treat as no children.
    return [];
  }
}

/**
 * Leaf-first recursive SIGKILL of `pid` and every descendant. Children are
 * killed before their parent so a freed parent can't leave a still-listening
 * child behind. `seen` guards against cycles / PID reuse during the walk.
 */
function killProcessTreeUnix(pid: number, seen: Set<number>): void {
  if (seen.has(pid)) return;
  seen.add(pid);
  for (const child of getChildPids(pid)) {
    killProcessTreeUnix(child, seen);
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // already dead
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

/**
 * Resolve the Python executable for a project directory, preferring a local
 * virtual environment (.venv, then venv) over the system Python.
 *
 * Pure — no console output. Call sites that want to log "Using virtual
 * environment: ..." should do so after calling this.
 */
export function findProjectPython(cwd: string): string {
  const { binDir, pythonExe, pythonCmd } = getPythonPaths();
  for (const venvDir of ['.venv', 'venv']) {
    const candidate = path.join(cwd, venvDir, binDir, pythonExe);
    if (fs.existsSync(candidate)) return candidate;
  }
  return pythonCmd;
}
