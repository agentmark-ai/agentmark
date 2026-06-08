import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

/**
 * `--yes` exists so CI jobs and coding agents can run the init headlessly —
 * a single blocking TTY prompt is a hang in that context. These tests pin
 * the contract two ways:
 *
 *   1. The strong property: with `yes` set, `prompts` is NEVER invoked.
 *      The mock below throws on call, so any future code path that re-adds
 *      a prompt under --yes fails loudly here instead of hanging a CI job.
 *   2. Each resolver lands on the same value its interactive prompt offers
 *      as the default — --yes is "press Enter everywhere", not a new mode.
 */
vi.mock('prompts', () => ({
  default: vi.fn(() => {
    throw new Error('prompts() was invoked in --yes mode — non-interactive contract broken');
  }),
}));

import {
  defaultFolderName,
  resolveTargetPath,
  resolveClients,
  shouldWriteAgentmarkJson,
  ALL_CLIENTS,
  USAGE,
} from '../../src/index.js';

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-agentmark-yes-'));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('defaultFolderName', () => {
  it('returns "." when the directory has a package.json', () => {
    fs.writeJsonSync(path.join(tmpDir, 'package.json'), { name: 'host' });
    expect(defaultFolderName(tmpDir)).toBe('.');
  });

  it('returns "." when the directory has a pyproject.toml', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "host"\n');
    expect(defaultFolderName(tmpDir)).toBe('.');
  });

  it('returns "my-agentmark-app" for an empty directory', () => {
    expect(defaultFolderName(tmpDir)).toBe('my-agentmark-app');
  });
});

describe('resolveTargetPath with --yes', () => {
  it('uses cwd when cwd is an existing project, without prompting', async () => {
    fs.writeJsonSync(path.join(process.cwd(), 'package.json'), { name: 'host' });
    const result = await resolveTargetPath(undefined, true);
    expect(result).toEqual({ targetPath: process.cwd(), isCurrentDir: true });
  });

  it('creates the greenfield default folder when cwd is empty, without prompting', async () => {
    const result = await resolveTargetPath(undefined, true);
    const expected = path.join(process.cwd(), 'my-agentmark-app');
    expect(result).toEqual({ targetPath: expected, isCurrentDir: false });
    expect(fs.existsSync(expected)).toBe(true);
  });

  it('lets an explicit path win over --yes defaults', async () => {
    const result = await resolveTargetPath('chosen-folder', true);
    expect(result).toEqual({
      targetPath: path.join(process.cwd(), 'chosen-folder'),
      isCurrentDir: false,
    });
  });
});

describe('resolveClients with --yes', () => {
  it('selects every client (the interactive default), without prompting', async () => {
    const result = await resolveClients(undefined, true);
    expect(result).toEqual([...ALL_CLIENTS]);
  });

  it('lets explicit --client values win over --yes', async () => {
    const result = await resolveClients(['cursor'], true);
    expect(result).toEqual(['cursor']);
  });

  it('still validates explicit clients under --yes', async () => {
    await expect(
      resolveClients(['not-a-client' as never], true),
    ).rejects.toThrow(/Invalid client "not-a-client"/);
  });
});

describe('shouldWriteAgentmarkJson with --yes', () => {
  it('writes when no file exists', async () => {
    const target = path.join(tmpDir, 'agentmark.json');
    expect(await shouldWriteAgentmarkJson(target, undefined, true)).toBe(true);
  });

  it('keeps an existing file (the safe interactive default), without prompting', async () => {
    const target = path.join(tmpDir, 'agentmark.json');
    fs.writeJsonSync(target, { existing: true });
    expect(await shouldWriteAgentmarkJson(target, undefined, true)).toBe(false);
  });

  it('lets --overwrite win over the --yes keep-existing default', async () => {
    const target = path.join(tmpDir, 'agentmark.json');
    fs.writeJsonSync(target, { existing: true });
    expect(await shouldWriteAgentmarkJson(target, true, true)).toBe(true);
  });
});

describe('USAGE', () => {
  it('documents every supported flag', () => {
    for (const flag of ['--path', '--client', '--yes', '-y', '--overwrite', '--help', '-h']) {
      expect(USAGE).toContain(flag);
    }
  });

  it('does not document the internal --api-url escape hatch', () => {
    expect(USAGE).not.toContain('--api-url');
  });
});
