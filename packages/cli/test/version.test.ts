import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Helper functions
function getExpectedVersion(): string {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.version;
}

function executeCliVersion(flag: string): string {
  const cliPath = path.join(__dirname, '..', 'dist', 'index.js');
  return execSync(`node ${cliPath} ${flag}`, { encoding: 'utf-8' }).trim();
}

describe('agentmark --version', () => {
  let expectedVersion: string;

  beforeAll(() => {
    expectedVersion = getExpectedVersion();
  });

  it('outputs the correct version from package.json with --version flag', () => {
    const output = executeCliVersion('--version');
    expect(output).toBe(expectedVersion);
  });

  it('outputs the correct version with -v flag', () => {
    const output = executeCliVersion('-v');
    expect(output).toBe(expectedVersion);
  });

  it('version follows semantic versioning format', () => {
    // Verify version format: major.minor.patch (optionally with -beta.X, -alpha.X, etc.)
    const semverPattern = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
    expect(expectedVersion).toMatch(semverPattern);
  });

  it('version is not empty or undefined', () => {
    expect(expectedVersion).toBeDefined();
    expect(expectedVersion).not.toBe('');
    expect(expectedVersion.length).toBeGreaterThan(0);
  });
});
