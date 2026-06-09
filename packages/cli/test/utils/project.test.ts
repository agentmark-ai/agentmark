import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  detectProjectLanguage,
  readAgentmarkConfig,
  loadAgentmarkConfig,
  AGENTMARK_CONFIG_NOT_FOUND,
  promptsDir,
  findFiles,
  findPromptFiles,
  determinePromptKind,
  readFrontmatter,
  validateConfigShape,
  KNOWN_CONFIG_KEYS,
  REQUIRED_CONFIG_KEYS,
} from '../../cli-src/utils/project';

const tmpDirs: string[] = [];
function mkProject(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-project-'));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe('detectProjectLanguage', () => {
  it('defaults to typescript with no python markers', () => {
    expect(detectProjectLanguage(mkProject({ 'package.json': '{}' }))).toBe('typescript');
  });
  it('detects python via pyproject.toml', () => {
    expect(detectProjectLanguage(mkProject({ 'pyproject.toml': '' }))).toBe('python');
  });
  it('detects python via agentmark_client.py', () => {
    expect(detectProjectLanguage(mkProject({ 'agentmark_client.py': '' }))).toBe('python');
  });
  it('detects python via .agentmark/dev_server.py', () => {
    expect(detectProjectLanguage(mkProject({ '.agentmark/dev_server.py': '' }))).toBe('python');
  });
});

describe('readAgentmarkConfig / loadAgentmarkConfig', () => {
  it('reports a missing config without throwing', () => {
    expect(readAgentmarkConfig(mkProject())).toEqual({ exists: false, config: null });
  });
  it('reads a valid config', () => {
    const dir = mkProject({ 'agentmark.json': JSON.stringify({ agentmarkPath: '.', builtInModels: ['openai/gpt-4o'] }) });
    expect(readAgentmarkConfig(dir)).toEqual({ exists: true, config: { agentmarkPath: '.', builtInModels: ['openai/gpt-4o'] } });
  });
  it('reports invalid JSON without throwing', () => {
    const r = readAgentmarkConfig(mkProject({ 'agentmark.json': '{ not json' }));
    expect(r.exists).toBe(true);
    expect(r.config).toBeNull();
    expect(r.parseError).toMatch(/not valid JSON/);
  });
  it('rejects a non-object JSON value', () => {
    const r = readAgentmarkConfig(mkProject({ 'agentmark.json': '[1,2,3]' }));
    expect(r.config).toBeNull();
    expect(r.parseError).toMatch(/not a JSON object/);
  });
  it('loadAgentmarkConfig throws the canonical message when missing', () => {
    expect(() => loadAgentmarkConfig(mkProject())).toThrow(AGENTMARK_CONFIG_NOT_FOUND);
    expect(AGENTMARK_CONFIG_NOT_FOUND).toMatch(/agentmark\.json not found/);
  });
  it('loadAgentmarkConfig returns the parsed config', () => {
    const dir = mkProject({ 'agentmark.json': JSON.stringify({ version: '2.0.0' }) });
    expect(loadAgentmarkConfig(dir)).toEqual({ version: '2.0.0' });
  });
});

describe('promptsDir', () => {
  it('resolves <cwd>/<agentmarkPath>/agentmark', () => {
    expect(promptsDir('/proj', { agentmarkPath: '.' })).toBe(path.resolve('/proj', '.', 'agentmark'));
  });
  it('defaults agentmarkPath to "."', () => {
    expect(promptsDir('/proj', {})).toBe(path.resolve('/proj', '.', 'agentmark'));
  });
  it('surfaces the "/" footgun by resolving to the filesystem root', () => {
    expect(promptsDir('/proj', { agentmarkPath: '/' })).toBe(path.resolve('/', 'agentmark'));
  });
});

describe('findFiles / findPromptFiles', () => {
  it('finds nested prompt files and skips node_modules', async () => {
    const dir = mkProject({
      'agentmark/a.prompt.mdx': 'x',
      'agentmark/nested/b.prompt.mdx': 'x',
      'agentmark/notes.md': 'x',
      'agentmark/node_modules/pkg/c.prompt.mdx': 'x',
    });
    const found = (await findPromptFiles(path.join(dir, 'agentmark')))
      .map((f) => path.relative(dir, f))
      .sort();
    // findFiles returns OS-native paths (path.join), so build both expectations
    // with path.join — a forward-slash literal fails on Windows.
    expect(found).toEqual([path.join('agentmark', 'a.prompt.mdx'), path.join('agentmark', 'nested', 'b.prompt.mdx')]);
  });
  it('returns [] when the directory is missing', async () => {
    expect(await findFiles(path.join(mkProject(), 'nope'), /\.prompt\.mdx$/)).toEqual([]);
  });
});

describe('determinePromptKind', () => {
  it.each([
    ['text_config', 'text'],
    ['object_config', 'object'],
    ['image_config', 'image'],
    ['speech_config', 'speech'],
  ])('maps %s to %s', (key, kind) => {
    expect(determinePromptKind({ [key]: {} })).toBe(kind);
  });
  it('throws when no *_config block is present', () => {
    expect(() => determinePromptKind({ name: 'x' })).toThrow(/Could not determine prompt kind/);
  });
});

describe('readFrontmatter', () => {
  it('parses a valid frontmatter block', () => {
    const r = readFrontmatter('---\nname: greeting\ntext_config:\n  model_name: openai/gpt-4o\n---\n\nBody');
    expect(r).toEqual({ ok: true, data: { name: 'greeting', text_config: { model_name: 'openai/gpt-4o' } } });
  });
  it('fails when there is no frontmatter block', () => {
    expect(readFrontmatter('# just markdown')).toEqual({ ok: false, error: 'no frontmatter block' });
  });
  it('fails on invalid YAML', () => {
    const r = readFrontmatter('---\ntext_config: [unclosed\n---\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/invalid YAML/);
  });
});

describe('validateConfigShape', () => {
  it('accepts a complete config', () => {
    expect(validateConfigShape({ version: '2.0.0', agentmarkPath: '.', builtInModels: ['openai/gpt-4o'] })).toEqual({
      missingRequired: [],
      unknownKeys: [],
    });
  });
  it('flags a missing required key', () => {
    expect(validateConfigShape({ agentmarkPath: '.' }).missingRequired).toEqual(['version']);
  });
  it('flags unknown top-level keys (the schema is additionalProperties: false)', () => {
    const r = validateConfigShape({ version: '2.0.0', agentmarkPath: '.', buildInModels: ['x'] });
    expect(r.unknownKeys).toEqual(['buildInModels']);
    expect(r.missingRequired).toEqual([]);
  });
  it('stays in lock-step with agentmark.schema.json (no drift in either direction)', () => {
    // KNOWN_CONFIG_KEYS / REQUIRED_CONFIG_KEYS are hand-maintained mirrors of the
    // bundled schema. Reflect the schema itself and assert set equality both ways:
    // a property added to the schema but missing here would make `doctor` wrongly
    // flag it as an unknown-key typo, and a key left here after being removed from
    // the schema would let a now-invalid config pass. `arrayContaining` caught
    // neither; exact set/array equality catches both.
    const schema = JSON.parse(
      fs.readFileSync(fileURLToPath(new URL('../../agentmark.schema.json', import.meta.url)), 'utf8'),
    ) as { properties: Record<string, { deprecated?: boolean }>; required: string[] };

    expect(new Set(KNOWN_CONFIG_KEYS)).toEqual(new Set(Object.keys(schema.properties)));
    expect([...REQUIRED_CONFIG_KEYS].sort()).toEqual([...schema.required].sort());
  });

  it('keeps the deprecated `evals` field known so legacy configs still validate', () => {
    // Top-level `evals` is vestigial — the dashboard lists a running app's evals
    // live (the get-evals control-plane job), so the static declaration has no
    // effect. It is marked deprecated in the schema, but must stay a *known* key:
    // a config that still carries it must not trip doctor's unknown-key warning.
    const schema = JSON.parse(
      fs.readFileSync(fileURLToPath(new URL('../../agentmark.schema.json', import.meta.url)), 'utf8'),
    ) as { properties: Record<string, { deprecated?: boolean }> };

    expect(schema.properties.evals.deprecated).toBe(true);
    expect(KNOWN_CONFIG_KEYS).toContain('evals');
    expect(
      validateConfigShape({ version: '2.0.0', agentmarkPath: '.', evals: ['mentions_topic'] }).unknownKeys,
    ).toEqual([]);
  });
});
