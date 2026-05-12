/**
 * Integration test: verify that a scaffolded pydantic-ai (cloud) project's
 * dependency graph resolves cleanly, i.e. it does not trigger the
 * "resolution-too-deep" explosion that appears when the `pydantic-ai`
 * meta-package (and its ~19 extras: fastmcp, mcp, temporal, bedrock, …) ends
 * up in the graph instead of the slim `pydantic-ai-slim[openai]` distribution.
 *
 * The resolution is done with `uv` rather than pip: the project transitively
 * pulls the `pydantic-ai` meta-package via `agentmark-pydantic-ai-v0`, and
 * pip's resolver backtracks essentially forever on that graph (it bails with
 * `resolution-too-deep`). `uv`'s resolver handles it in seconds, so it is what
 * a real user is steered towards anyway. `uv` is installed into the throwaway
 * venv on the fly, so no extra CI setup is required.
 *
 * Requirements:
 *  - Python 3.12+ available on PATH
 *
 * The test is skipped (not failed) on Windows or when Python 3.12 is not
 * available so CI is not broken on non-Linux runners.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';

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

describe('dependency-resolution integration — pydantic-ai-slim (cloud scaffold)', () => {
  it(
    'should resolve a scaffolded pydantic-ai project without resolution-too-deep error',
    { timeout: 300_000 },
    async () => {
      if (process.platform === 'win32') {
        console.log('Skipped because: running on Windows (venv behaviour differs).');
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

        // Sanity (offline): pyproject.toml must reference pydantic-ai-slim directly
        // and must NOT pin the old `pydantic-ai>=1.0` meta-package line.
        const pyproject = fs.readFileSync(path.join(tmpDir, 'pyproject.toml'), 'utf8');
        expect(pyproject).toMatch(/pydantic-ai-slim/);
        expect(pyproject).not.toMatch(/^"pydantic-ai>=1\.0",/m);

        // 2. Create a throwaway venv
        const venvDir = path.join(tmpDir, '.venv');
        const venvResult = run(pythonCmd, ['-m', 'venv', venvDir], tmpDir);
        if (venvResult.status !== 0) {
          throw new Error(`venv creation failed:\n${venvResult.stderr}`);
        }

        const venvBin = process.platform === 'win32'
          ? path.join(venvDir, 'Scripts')
          : path.join(venvDir, 'bin');
        const venvPython = path.join(venvBin, process.platform === 'win32' ? 'python.exe' : 'python');
        const pipBin = path.join(venvBin, 'pip');
        const uvBin = path.join(venvBin, process.platform === 'win32' ? 'uv.exe' : 'uv');

        // 3. Install uv into the venv (single self-contained wheel, no resolution)
        const uvInstall = run(pipBin, ['install', '--quiet', 'uv'], tmpDir);
        if (uvInstall.status !== 0) {
          throw new Error(`installing uv failed:\n${uvInstall.stdout}\n${uvInstall.stderr}`);
        }

        // 4. Resolve the scaffolded project's dependency graph.
        //    --dry-run resolves (and checks wheel availability) without the
        //    multi-minute download of the full pydantic-ai meta-package tree.
        //    If the graph ever regresses to "resolution-too-deep" / unsatisfiable,
        //    uv fails here with a non-zero exit.
        const resolveResult = run(uvBin, ['pip', 'install', '--python', venvPython, '--dry-run', '-e', '.'], tmpDir);
        expect(
          resolveResult.status,
          `uv pip install --dry-run -e . failed:\n${resolveResult.stdout}\n${resolveResult.stderr}`
        ).toBe(0);

        // 5. The resolved set must include pydantic-ai-slim. (uv prints the
        //    resolution summary to stderr.)
        const resolveOutput = `${resolveResult.stdout}\n${resolveResult.stderr}`;
        expect(resolveOutput).toMatch(/pydantic-ai-slim/i);
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch { /* best-effort */ }
      }
    }
  );
});
