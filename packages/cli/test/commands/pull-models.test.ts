import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { tmpdir } from 'os';
import { promises as fsp } from 'fs';

/**
 * Tests for the `pull-models` command — specifically the new
 * `--provider` and `--models` flag paths that skip the interactive
 * picker for CI usage.
 *
 * Why these tests matter for regression catching:
 * - If someone restores the unconditional prompt() call, CI scripts
 *   that pass --provider+--models would silently hang (regression).
 * - If validation of unknown providers/models is dropped, CI silently
 *   adds typos to agentmark.json (silent data corruption).
 */

// `vi.mock` is hoisted above non-imports; PROVIDERS lives inside the
// factory itself so the reference resolves correctly when the
// hoisted mock evaluates.
vi.mock('../../cli-src/utils/providers', () => ({
  getProviders: vi.fn().mockResolvedValue({
    openai: {
      label: 'OpenAI',
      languageModels: ['openai/gpt-4o', 'openai/gpt-4o-mini'],
      imageModels: ['openai/dall-e-3'],
      speechModels: [],
    },
    anthropic: {
      label: 'Anthropic',
      languageModels: ['anthropic/claude-3-5-sonnet', 'anthropic/claude-3-5-haiku'],
      imageModels: [],
      speechModels: [],
    },
  }),
}));

vi.mock('prompts', () => ({
  default: vi.fn(),
}));

import pullModels from '../../cli-src/commands/pull-models';
import prompts from 'prompts';

let workDir: string;
let consoleLog: ReturnType<typeof vi.spyOn>;
let cwdSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  workDir = await fsp.mkdtemp(path.join(tmpdir(), 'pull-models-test-'));
  // Stub process.cwd() instead of chdir'ing. chdir() is process-wide
  // and leaks across parallel test files (build.test.ts, forwarder
  // tests, etc. all rely on the original cwd). Stubbing keeps the
  // mutation scoped to this test's mocks.
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workDir);
  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  await fsp.rm(workDir, { recursive: true, force: true });
  vi.clearAllMocks();
  consoleLog.mockRestore();
  cwdSpy.mockRestore();
});

async function writeAgentmarkJson(content: object): Promise<void> {
  await fsp.writeFile(
    path.join(workDir, 'agentmark.json'),
    JSON.stringify(content, null, 2),
    'utf-8',
  );
}

async function readAgentmarkJson(): Promise<Record<string, unknown>> {
  const raw = await fsp.readFile(path.join(workDir, 'agentmark.json'), 'utf-8');
  return JSON.parse(raw);
}

describe('pull-models (non-interactive)', () => {
  it('adds the specified models without prompting when --provider + --models are passed', async () => {
    await writeAgentmarkJson({ agentmarkPath: '.', version: '2.0.0' });

    await pullModels({
      provider: 'openai',
      models: 'openai/gpt-4o,openai/gpt-4o-mini',
    });

    // Catches regression: someone re-introduces an unconditional prompt
    // call in the non-interactive path → CI hangs.
    expect(prompts).not.toHaveBeenCalled();

    const updated = await readAgentmarkJson();
    expect(updated.builtInModels).toEqual([
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
    ]);
  });

  it('preserves models that were already in builtInModels (dedupes the new ones)', async () => {
    // Catches regression: someone overwrites the builtInModels array
    // wholesale instead of merging → existing model registrations lost.
    await writeAgentmarkJson({
      agentmarkPath: '.',
      builtInModels: ['anthropic/claude-3-5-sonnet'],
    });

    await pullModels({
      provider: 'openai',
      models: 'openai/gpt-4o',
    });

    const updated = await readAgentmarkJson();
    expect(updated.builtInModels).toEqual([
      'openai/gpt-4o',
      'anthropic/claude-3-5-sonnet',
    ]);
  });

  it('rejects an unknown provider before touching agentmark.json', async () => {
    await writeAgentmarkJson({ agentmarkPath: '.', version: '2.0.0' });

    await expect(
      pullModels({ provider: 'pretendai', models: 'pretendai/foo' }),
    ).rejects.toThrow(/Unknown provider "pretendai"/);

    // Untouched.
    const after = await readAgentmarkJson();
    expect(after.builtInModels).toBeUndefined();
  });

  it('accepts leaf model names when --provider is given (prefix is redundant)', async () => {
    // Catches regression: `--provider anthropic --models claude-3-5-sonnet`
    // failing with "Unknown models" even though the provider is explicit —
    // the exact first-contact failure Python/Bedrock onboarding hit.
    await writeAgentmarkJson({ agentmarkPath: '.', version: '2.0.0' });

    await pullModels({
      provider: 'anthropic',
      models: 'claude-3-5-sonnet,claude-3-5-haiku',
    });

    expect(prompts).not.toHaveBeenCalled();
    const updated = await readAgentmarkJson();
    expect(updated.builtInModels).toEqual([
      'anthropic/claude-3-5-sonnet',
      'anthropic/claude-3-5-haiku',
    ]);
  });

  it('rejects unknown models for the given provider before touching agentmark.json', async () => {
    // Catches regression: typo in --models silently lands in
    // builtInModels and only surfaces at SDK-load time later.
    await writeAgentmarkJson({ agentmarkPath: '.', version: '2.0.0' });

    await expect(
      pullModels({ provider: 'openai', models: 'openai/gpt-9000' }),
    ).rejects.toThrow(/Unknown models for provider "openai": openai\/gpt-9000/);

    const after = await readAgentmarkJson();
    expect(after.builtInModels).toBeUndefined();
  });

  it('the unknown-model error explains the provider-prefixed ID form', async () => {
    await writeAgentmarkJson({ agentmarkPath: '.', version: '2.0.0' });

    await expect(
      pullModels({ provider: 'anthropic', models: 'claude-9000' }),
    ).rejects.toThrow(/provider-prefixed \(e\.g\. "anthropic\/claude-3-5-sonnet"\)/);
  });

  it('skips already-added models instead of erroring (idempotent for CI)', async () => {
    await writeAgentmarkJson({
      agentmarkPath: '.',
      version: '2.0.0',
      builtInModels: ['anthropic/claude-3-5-sonnet'],
    });

    await pullModels({
      provider: 'anthropic',
      models: 'claude-3-5-sonnet,claude-3-5-haiku',
    });

    const updated = await readAgentmarkJson();
    expect(updated.builtInModels).toEqual([
      'anthropic/claude-3-5-haiku',
      'anthropic/claude-3-5-sonnet',
    ]);
    expect(consoleLog).toHaveBeenCalledWith(
      'Already in builtInModels (skipped): anthropic/claude-3-5-sonnet',
    );
  });

  it('is a no-op (no write, no error) when every requested model is already added', async () => {
    await writeAgentmarkJson({
      agentmarkPath: '.',
      version: '2.0.0',
      builtInModels: ['anthropic/claude-3-5-sonnet'],
    });
    const before = await fsp.readFile(path.join(workDir, 'agentmark.json'), 'utf-8');

    await pullModels({ provider: 'anthropic', models: 'claude-3-5-sonnet' });

    const after = await fsp.readFile(path.join(workDir, 'agentmark.json'), 'utf-8');
    expect(after).toBe(before);
    expect(consoleLog).toHaveBeenCalledWith('All requested models already added.');
  });

  it('rejects an empty --models list (parse error guard)', async () => {
    await writeAgentmarkJson({ agentmarkPath: '.', version: '2.0.0' });

    await expect(
      pullModels({ provider: 'openai', models: ' , ,' }),
    ).rejects.toThrow(/--models was empty/);
  });

  it('throws when agentmark.json is missing — same as the interactive path', async () => {
    // No agentmark.json in workDir.
    await expect(
      pullModels({ provider: 'openai', models: 'openai/gpt-4o' }),
    ).rejects.toThrow(/agentmark\.json not found/);
  });
});

describe('pull-models provider setup hint', () => {
  function loggedText(): string {
    return consoleLog.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
  }

  it('prints the @ai-sdk import hint in TypeScript projects', async () => {
    await writeAgentmarkJson({ agentmarkPath: '.', version: '2.0.0' });

    await pullModels({ provider: 'openai', models: 'openai/gpt-4o' });

    const text = loggedText();
    expect(text).toContain('import { openai } from "@ai-sdk/openai";');
    expect(text).toContain('.registerProviders({ openai })');
  });

  it('prints executor guidance — no TypeScript imports — in Python projects', async () => {
    // Catches regression: TS-only advice (`import { anthropic } from
    // "@ai-sdk/anthropic"`) printed into a Python project, where none of it
    // is actionable.
    await writeAgentmarkJson({ agentmarkPath: '.', version: '2.0.0' });
    await fsp.writeFile(path.join(workDir, 'requirements.txt'), 'anthropic\n');

    await pullModels({ provider: 'anthropic', models: 'claude-3-5-sonnet' });

    const text = loggedText();
    expect(text).toContain('Make sure your executor handles models from: anthropic');
    expect(text).toContain('https://docs.agentmark.co/integrations/bring-your-own-sdk');
    expect(text).not.toContain('@ai-sdk');
    expect(text).not.toContain('registerProviders');
  });
});
