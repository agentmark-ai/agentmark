import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

describe('agentmark --version', () => {
  it('outputs the correct version from package.json', () => {
    // Read the version from package.json
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const expectedVersion = packageJson.version;

    // Run the CLI with --version flag
    const cliPath = path.join(__dirname, '..', 'dist', 'index.js');
    const output = execSync(`node ${cliPath} --version`, { encoding: 'utf-8' }).trim();

    // Verify the output matches the package.json version
    expect(output).toBe(expectedVersion);
  });

  it('outputs version with -v flag', () => {
    // Read the version from package.json
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const expectedVersion = packageJson.version;

    // Run the CLI with -v flag
    const cliPath = path.join(__dirname, '..', 'dist', 'index.js');
    const output = execSync(`node ${cliPath} -v`, { encoding: 'utf-8' }).trim();

    // Verify the output matches the package.json version
    expect(output).toBe(expectedVersion);
  });
});
