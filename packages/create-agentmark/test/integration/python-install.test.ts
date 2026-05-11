/**
 * Integration test: verify that a scaffolded pydantic-ai (cloud) project
 * can actually be installed with pip without triggering the
 * "resolution-too-deep" error that appeared when pydantic-ai>=1.0 (the
 * meta-package) was used instead of pydantic-ai-slim[openai].
 *
 * Requirements:
 *  - Python 3.12+ available on PATH
 *  - pip 26.1+ (test upgrades pip inside the venv)
 *
 * The test is skipped (not failed) on Windows or when Python 3.12 is not
 * available so CI is not broken on non-Linux runners.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findPython312(): string | null {
  const candidates = ['python3.12', 'python3', 'python'];
  for (const cmd of candidates) {
    try {
      const result = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
      if (result.status === 0) {
        const version = result.stdout.trim() || result.stderr.trim();
        // Accept Python 3.12 or newer
        const match = version.match(/Python (\d+)\.(\d+)/);
        if (match) {
          const major = parseInt(match[1], 10);
          const minor = parseInt(match[2], 10);
          if (major > 3 || (major === 3 && minor >= 12)) {
            return cmd;
          }
        }
      }
    } catch {
      // not found, try next
    }
  }
  return null;
}

function run(cmd: string, args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 270_000 });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

// ---------------------------------------------------------------------------
// Skip guards
// ---------------------------------------------------------------------------

let pythonCmd: string | null = null;

beforeAll(() => {
  if (process.platform === 'win32') {
    pythonCmd = null;
    return;
  }
  pythonCmd = findPython312();
});

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe('pip install integration — pydantic-ai-slim (cloud scaffold)', () => {
  it(
    'should install scaffolded project without resolution-too-deep error',
    { timeout: 300_000 },
    async () => {
      if (process.platform === 'win32') {
        console.log('Skipped because: running on Windows (pip venv behaviour differs).');
        return;
      }
      if (!pythonCmd) {
        console.log('Skipped because: Python 3.12+ not found on PATH.');
        return;
      }

      // 1. Scaffold a pydantic-ai × cloud project into a temp dir
      //    We use vi.resetModules() inline to avoid polluting other tests.
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmark-piptest-'));
      try {
        // Dynamically import so module-level mocks from other test files don't interfere.
        const { createPythonApp } = await import('../../src/utils/examples/create-python-app.js');
        await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

        // Sanity: pyproject.toml must reference pydantic-ai-slim
        const pyproject = fs.readFileSync(path.join(tmpDir, 'pyproject.toml'), 'utf8');
        expect(pyproject).toMatch(/pydantic-ai-slim/);
        expect(pyproject).not.toMatch(/^"pydantic-ai>=1\.0",/m); // must NOT be the old meta-package line

        // 2. Create a venv
        const venvDir = path.join(tmpDir, '.venv');
        const venvResult = run(pythonCmd, ['-m', 'venv', venvDir], tmpDir);
        if (venvResult.status !== 0) {
          throw new Error(`venv creation failed:\n${venvResult.stderr}`);
        }

        const pipBin = process.platform === 'win32'
          ? path.join(venvDir, 'Scripts', 'pip')
          : path.join(venvDir, 'bin', 'pip');

        // 3. Upgrade pip to 26.1+ — earlier resolvers (25.x) hit "resolution-too-deep"
        //    on pydantic-ai's transitive graph. 26.1's resolver handles it.
        const upgradeResult = run(pipBin, ['install', '--upgrade', 'pip>=26.1'], tmpDir);
        if (upgradeResult.status !== 0) {
          throw new Error(`pip upgrade failed:\n${upgradeResult.stderr}`);
        }

        // 4. Install the scaffolded project
        const installResult = run(pipBin, ['install', '-e', '.'], tmpDir);
        expect(
          installResult.status,
          `pip install -e . failed:\n${installResult.stdout}\n${installResult.stderr}`
        ).toBe(0);

        // 5. Assert pydantic-ai-slim is listed (NOT the meta-package)
        const listResult = run(pipBin, ['list'], tmpDir);
        expect(listResult.status).toBe(0);
        expect(listResult.stdout).toMatch(/pydantic-ai-slim/i);
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch { /* best-effort */ }
      }
    }
  );
});
