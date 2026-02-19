import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { findProjectRoot } from '../../cli-src/config.js';

describe('findProjectRoot', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmark-config-test-'));
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it('returns the directory containing agentmark.json when called from that directory', () => {
    fs.writeJsonSync(path.join(tempDir, 'agentmark.json'), { version: '2.0.0' });
    expect(findProjectRoot(tempDir)).toBe(tempDir);
  });

  it('returns the parent directory when called from a subdirectory', () => {
    fs.writeJsonSync(path.join(tempDir, 'agentmark.json'), { version: '2.0.0' });
    const subDir = path.join(tempDir, 'agentmark');
    fs.mkdirSync(subDir);
    expect(findProjectRoot(subDir)).toBe(tempDir);
  });

  it('returns the starting directory when no agentmark.json is found (fallback)', () => {
    expect(findProjectRoot(tempDir)).toBe(tempDir);
  });

  it('returns the nearest agentmark.json when nested projects exist', () => {
    fs.writeJsonSync(path.join(tempDir, 'agentmark.json'), { version: '2.0.0' });
    const innerDir = path.join(tempDir, 'inner');
    fs.mkdirSync(innerDir);
    fs.writeJsonSync(path.join(innerDir, 'agentmark.json'), { version: '2.0.0' });
    expect(findProjectRoot(innerDir)).toBe(innerDir);
  });
});
