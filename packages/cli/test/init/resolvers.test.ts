import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

/**
 * `--yes` exists so CI jobs and coding agents can run init headlessly —
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
  detectCurrentClients,
  ALL_CLIENTS,
} from '../../cli-src/commands/init';

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmark-init-yes-'));
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

describe('detectCurrentClients', () => {
  // Use tmpDir/home as the fake homedir and tmpDir/project as the target.
  // This isolates tests from the real home dir and real env vars.
  let fakeHome: string;
  let projectDir: string;

  beforeEach(() => {
    fakeHome = path.join(tmpDir, 'home');
    projectDir = path.join(tmpDir, 'project');
    fs.ensureDirSync(fakeHome);
    fs.ensureDirSync(projectDir);
  });

  it('returns [] when no editor config dirs exist anywhere', () => {
    expect(detectCurrentClients(projectDir, fakeHome)).toEqual([]);
  });

  // ── Home dir (primary signal) ─────────────────────────────────────────
  it('detects claude-code from ~/.claude/', () => {
    fs.ensureDirSync(path.join(fakeHome, '.claude'));
    expect(detectCurrentClients(projectDir, fakeHome)).toEqual(['claude-code']);
  });

  it('detects codex from ~/.codex/', () => {
    fs.ensureDirSync(path.join(fakeHome, '.codex'));
    expect(detectCurrentClients(projectDir, fakeHome)).toEqual(['codex']);
  });

  it('detects cursor from ~/.cursor/', () => {
    fs.ensureDirSync(path.join(fakeHome, '.cursor'));
    expect(detectCurrentClients(projectDir, fakeHome)).toEqual(['cursor']);
  });

  it('detects zed from ~/.config/zed/', () => {
    fs.ensureDirSync(path.join(fakeHome, '.config', 'zed'));
    expect(detectCurrentClients(projectDir, fakeHome)).toEqual(['zed']);
  });

  it('detects zed from ~/Library/Application Support/zed/', () => {
    fs.ensureDirSync(path.join(fakeHome, 'Library', 'Application Support', 'zed'));
    expect(detectCurrentClients(projectDir, fakeHome)).toEqual(['zed']);
  });

  it('detects multiple installed editors from co-existing home dirs', () => {
    fs.ensureDirSync(path.join(fakeHome, '.claude'));
    fs.ensureDirSync(path.join(fakeHome, '.cursor'));
    const result = detectCurrentClients(projectDir, fakeHome);
    expect(result).toContain('claude-code');
    expect(result).toContain('cursor');
    expect(result).not.toContain('vscode');
    expect(result).not.toContain('zed');
  });

  // ── Project dir fallback (only when home dir + env return nothing) ────
  it('falls back to project .vscode/ when home dir is empty', () => {
    fs.ensureDirSync(path.join(projectDir, '.vscode'));
    expect(detectCurrentClients(projectDir, fakeHome)).toEqual(['vscode']);
  });

  it('falls back to project .cursor/ when home dir is empty', () => {
    fs.ensureDirSync(path.join(projectDir, '.cursor'));
    expect(detectCurrentClients(projectDir, fakeHome)).toEqual(['cursor']);
  });

  it('falls back to project .zed/ when home dir is empty', () => {
    fs.ensureDirSync(path.join(projectDir, '.zed'));
    expect(detectCurrentClients(projectDir, fakeHome)).toEqual(['zed']);
  });

  it('falls back to project .mcp.json when home dir is empty', () => {
    fs.writeJsonSync(path.join(projectDir, '.mcp.json'), {});
    expect(detectCurrentClients(projectDir, fakeHome)).toEqual(['claude-code']);
  });

  it('falls back to project .claude/ when home dir is empty', () => {
    fs.ensureDirSync(path.join(projectDir, '.claude'));
    expect(detectCurrentClients(projectDir, fakeHome)).toEqual(['claude-code']);
  });

  it('home dir wins over project dir when both have configs', () => {
    // Home has cursor; project has vscode — should return cursor only (home wins)
    fs.ensureDirSync(path.join(fakeHome, '.cursor'));
    fs.ensureDirSync(path.join(projectDir, '.vscode'));
    const result = detectCurrentClients(projectDir, fakeHome);
    expect(result).toContain('cursor');
    expect(result).not.toContain('vscode');
  });
});
