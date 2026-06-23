/**
 * Agentmark templates-root resolution — the key prompts are searched by.
 *
 * The `agentmark/` directory is user-configurable (agentmark.json
 * `agentmarkPath`), and a prompt is addressed RELATIVE TO that root
 * (`parent_path` + `name`). These tests pin that the path emitted onto traces
 * as `agentmark.prompt_path` is root-relative and strips a custom prefix — so
 * the trace surface can look the prompt back up regardless of where the user
 * put the agentmark dir.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  resolveAgentmarkTemplatesBase,
  promptPathFromAgentmarkRoot,
} from '../cli-src/config';

describe('agentmark templates-root resolution', () => {
  let root: string;

  beforeEach(() => {
    // realpath: os.tmpdir() is a symlink on macOS (/var -> /private/var); the
    // helper resolves paths, so the fixture root must be resolved too.
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'am-cfg-')));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writePrompt(rel: string): string {
    const full = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '---\nname: triage\ntext_config:\n  model_name: test\n---\n');
    return full;
  }

  it('resolveAgentmarkTemplatesBase defaults to <root>/agentmark', () => {
    fs.writeFileSync(path.join(root, 'agentmark.json'), '{}');
    expect(resolveAgentmarkTemplatesBase(root)).toBe(path.join(root, 'agentmark'));
  });

  it('resolveAgentmarkTemplatesBase honors a custom agentmarkPath', () => {
    fs.writeFileSync(
      path.join(root, 'agentmark.json'),
      JSON.stringify({ agentmarkPath: 'src' })
    );
    expect(resolveAgentmarkTemplatesBase(root)).toBe(
      path.join(root, 'src', 'agentmark')
    );
  });

  it('promptPathFromAgentmarkRoot is relative to the agentmark root (default layout)', () => {
    fs.writeFileSync(path.join(root, 'agentmark.json'), '{}');
    const file = writePrompt('agentmark/support/triage.prompt.mdx');
    expect(promptPathFromAgentmarkRoot(file)).toBe('support/triage.prompt.mdx');
  });

  it('promptPathFromAgentmarkRoot strips a custom agentmarkPath prefix', () => {
    fs.writeFileSync(
      path.join(root, 'agentmark.json'),
      JSON.stringify({ agentmarkPath: 'src' })
    );
    const file = writePrompt('src/agentmark/support/triage.prompt.mdx');
    expect(promptPathFromAgentmarkRoot(file)).toBe('support/triage.prompt.mdx');
  });

  it('promptPathFromAgentmarkRoot returns undefined for a file outside the agentmark root', () => {
    fs.writeFileSync(path.join(root, 'agentmark.json'), '{}');
    const file = writePrompt('elsewhere/triage.prompt.mdx');
    expect(promptPathFromAgentmarkRoot(file)).toBeUndefined();
  });
});
