import { describe, it, expect, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import doctor, { runDoctor, type DoctorReport, type CheckStatus } from '../cli-src/commands/doctor';
import { AGENTMARK_CONFIG_NOT_FOUND } from '../cli-src/utils/project';
import { clientNotFoundMessages, devEntryNotFoundMessages } from '../cli-src/utils/setup-files';

const tmpDirs: string[] = [];

function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-doctor-'));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

/** Deterministic env + node version so checks don't depend on the host. */
const run = (dir: string, env: Record<string, string> = { AGENTMARK_API_KEY: 'k', AGENTMARK_APP_ID: 'a' }) =>
  runDoctor(dir, { env, nodeVersion: '22.0.0' });

const statusOf = (report: DoctorReport, id: string): CheckStatus | undefined =>
  report.results.find((r) => r.id === id)?.status;

const detailOf = (report: DoctorReport, id: string): string | undefined =>
  report.results.find((r) => r.id === id)?.detail;

const fixOf = (report: DoctorReport, id: string): string | undefined =>
  report.results.find((r) => r.id === id)?.fix;

const HEALTHY: Record<string, string> = {
  'agentmark.json': JSON.stringify({ agentmarkPath: '.', version: '2.0.0', builtInModels: ['openai/gpt-4o'] }),
  'agentmark/greeting.prompt.mdx': '---\nname: greeting\ntext_config:\n  model_name: openai/gpt-4o\n---\n\nHello {props.name}',
  'agentmark.client.ts': '// client',
  'dev-entry.ts': '// dev entry',
  'handler.ts': '// deploy handler',
  'package.json': JSON.stringify({
    name: 'app',
    dependencies: {
      '@agentmark-ai/sdk': '^0.4.0',
      '@agentmark-ai/fallback-adapter': '^1.0.0',
      '@ai-sdk/openai': '^2.0.0',
    },
  }),
  '.gitignore': 'node_modules\n.env\n',
  '.env': 'AGENTMARK_API_KEY=x\n',
};

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe('agentmark doctor — runDoctor', () => {
  it('passes a fully-wired project with no failures', async () => {
    const report = await run(makeProject(HEALTHY));

    expect(report.ok).toBe(true);
    expect(report.counts.fail).toBe(0);
    // Spot-check the load-bearing checks, not just the aggregate.
    expect(statusOf(report, 'config.found')).toBe('pass');
    expect(statusOf(report, 'config.agentmarkPath')).toBe('pass');
    expect(statusOf(report, 'client.file')).toBe('pass');
    expect(statusOf(report, 'prompts.parse')).toBe('pass');
    expect(statusOf(report, 'models.builtIn')).toBe('pass');
    expect(statusOf(report, 'deps.sdk')).toBe('pass');
    expect(statusOf(report, 'env.credentials')).toBe('pass');
    expect(statusOf(report, 'env.gitignored')).toBe('pass');
    expect(statusOf(report, 'config.schema')).toBe('pass');
    expect(statusOf(report, 'deploy.handler')).toBe('pass');
  });

  it('emits the documented stable check ids and result shape (the --json contract)', async () => {
    const report = await run(makeProject(HEALTHY));

    // The id set is a contract agents branch on (skill docs `--json`). Pin it
    // exactly so a rename or accidental drop fails here, not silently in the wild.
    expect(report.results.map((r) => r.id).sort()).toEqual([
      'client.file',
      'config.agentmarkPath',
      'config.found',
      'config.schema',
      'deploy.handler',
      'deps.sdk',
      'devEntry.file',
      'env.credentials',
      'env.gitignored',
      'models.builtIn',
      'models.known',
      'prompts.parse',
      'prompts.present',
    ]);
    // Every result carries the documented shape, with a status from the enum.
    for (const r of report.results) {
      expect(r.id).toEqual(expect.any(String));
      expect(r.group).toEqual(expect.any(String));
      expect(r.title).toEqual(expect.any(String));
      expect(['pass', 'warn', 'fail', 'skip']).toContain(r.status);
    }
    expect(Object.keys(report.counts).sort()).toEqual(['fail', 'pass', 'skip', 'warn']);
  });

  it('fails when agentmark.json is missing and skips config-dependent checks', async () => {
    const report = await run(makeProject({ 'package.json': '{}' }));

    expect(statusOf(report, 'config.found')).toBe('fail');
    // Shares the single canonical "no project here" message with build/generate-schema/pull-models.
    expect(fixOf(report, 'config.found')).toBe(AGENTMARK_CONFIG_NOT_FOUND);
    expect(report.ok).toBe(false);
    // agentmarkPath / prompt checks are gated on a readable config.
    expect(statusOf(report, 'config.agentmarkPath')).toBeUndefined();
    expect(statusOf(report, 'prompts.parse')).toBeUndefined();
  });

  it('fails on the agentmarkPath="/" footgun', async () => {
    const report = await run(
      makeProject({
        ...HEALTHY,
        'agentmark.json': JSON.stringify({ agentmarkPath: '/', builtInModels: ['openai/gpt-4o'] }),
      }),
    );

    expect(statusOf(report, 'config.agentmarkPath')).toBe('fail');
    expect(detailOf(report, 'config.agentmarkPath')).toContain('filesystem root');
    expect(report.ok).toBe(false);
  });

  it('fails when agentmark.client.ts is missing', async () => {
    const files = { ...HEALTHY };
    delete (files as Record<string, string>)['agentmark.client.ts'];
    const report = await run(makeProject(files));

    expect(statusOf(report, 'client.file')).toBe('fail');
    // Shares dev's exact remediation line (same setup-files helper).
    expect(fixOf(report, 'client.file')).toBe(clientNotFoundMessages('typescript')[1]);
    expect(report.ok).toBe(false);
  });

  it('fails prompt parsing when a prompt has no model_name', async () => {
    const report = await run(
      makeProject({
        ...HEALTHY,
        'agentmark/broken.prompt.mdx': '---\nname: broken\ntext_config:\n  temperature: 0.5\n---\n\nNo model here',
      }),
    );

    expect(statusOf(report, 'prompts.parse')).toBe('fail');
    expect(detailOf(report, 'prompts.parse')).toContain('broken.prompt.mdx');
    expect(detailOf(report, 'prompts.parse')).toContain('model_name');
    expect(report.ok).toBe(false);
  });

  it('warns when builtInModels is empty (no allowlist, no autocomplete)', async () => {
    const report = await run(
      makeProject({
        ...HEALTHY,
        'agentmark.json': JSON.stringify({ version: '2.0.0', agentmarkPath: '.', builtInModels: [] }),
      }),
    );

    expect(statusOf(report, 'models.builtIn')).toBe('warn');
    expect(detailOf(report, 'models.builtIn')).toContain('empty');
    expect(report.ok).toBe(true);
  });

  it('warns that a prompt model missing from a non-empty builtInModels will be rejected', async () => {
    const report = await run(
      makeProject({
        ...HEALTHY,
        // Non-empty allowlist that omits the model the prompt uses.
        'agentmark.json': JSON.stringify({ version: '2.0.0', agentmarkPath: '.', builtInModels: ['openai/gpt-4o-mini'] }),
      }),
    );

    expect(statusOf(report, 'models.builtIn')).toBe('warn');
    expect(detailOf(report, 'models.builtIn')).toContain('openai/gpt-4o');
    expect(detailOf(report, 'models.builtIn')).toContain('allowlist');
    expect(report.ok).toBe(true);
  });

  it('warns (does not fail) when the dev-server entry is missing', async () => {
    const files = { ...HEALTHY };
    delete (files as Record<string, string>)['dev-entry.ts'];
    const report = await run(makeProject(files));

    expect(statusOf(report, 'devEntry.file')).toBe('warn');
    // Shares dev's exact remediation line (same setup-files helper).
    expect(fixOf(report, 'devEntry.file')).toBe(devEntryNotFoundMessages('typescript')[2]);
    expect(report.ok).toBe(true);
  });

  it('no longer requires an SDK-specific adapter — a BYO project with just @agentmark-ai/sdk is clean', async () => {
    // Adapters were removed, so doctor must not flag a bring-your-own-SDK project
    // for lacking an `@agentmark-ai/*-adapter`. `deps.sdk` is the only JS dep
    // check; there is no `deps.adapter` / `deps.provider` to run.
    const report = await run(
      makeProject({
        ...HEALTHY,
        'package.json': JSON.stringify({ name: 'app', dependencies: { '@agentmark-ai/sdk': '^0.4.0' } }),
      }),
    );

    expect(statusOf(report, 'deps.sdk')).toBe('pass');
    expect(statusOf(report, 'deps.adapter')).toBeUndefined();
    expect(statusOf(report, 'deps.provider')).toBeUndefined();
  });

  it('treats a Python project correctly (skips JS deps, checks agentmark_client.py)', async () => {
    const report = await run(
      makeProject({
        'pyproject.toml': '[project]\nname = "app"\n',
        'agentmark_client.py': '# client',
        'agentmark.json': JSON.stringify({ agentmarkPath: '.', builtInModels: ['openai/gpt-4o'] }),
        'agentmark/greeting.prompt.mdx': '---\nname: greeting\ntext_config:\n  model_name: openai/gpt-4o\n---\n\nHi',
      }),
    );

    expect(statusOf(report, 'client.file')).toBe('pass');
    expect(statusOf(report, 'deps.python')).toBe('skip');
    // The JS dependency checks must not run for a Python project.
    expect(statusOf(report, 'deps.sdk')).toBeUndefined();
  });

  it('warns when .env exists but is not gitignored', async () => {
    const report = await run(
      makeProject({
        ...HEALTHY,
        '.gitignore': 'node_modules\n', // no .env entry
      }),
    );

    expect(statusOf(report, 'env.gitignored')).toBe('warn');
  });

  it('warns when a builtInModels entry is not in the model catalog (reuses classifyModels)', async () => {
    const report = await run(
      makeProject({
        ...HEALTHY,
        'agentmark.json': JSON.stringify({ agentmarkPath: '.', builtInModels: ['openai/totally-made-up-model-zzz'] }),
        'agentmark/greeting.prompt.mdx': '---\nname: greeting\ntext_config:\n  model_name: openai/totally-made-up-model-zzz\n---\n\nHi',
      }),
    );

    // The fake model is declared in builtInModels (so models.builtIn passes) but
    // is absent from the registry catalog, so the catalog check warns. Either
    // way it never fails the run.
    expect(statusOf(report, 'models.builtIn')).toBe('pass');
    expect(['warn', 'skip']).toContain(statusOf(report, 'models.known'));
    if (statusOf(report, 'models.known') === 'warn') {
      expect(detailOf(report, 'models.known')).toContain('openai/totally-made-up-model-zzz');
    }
    expect(report.ok).toBe(true);
  });

  it('warns when agentmark.json is missing a required field or has an unknown key', async () => {
    const report = await run(
      makeProject({
        ...HEALTHY,
        // no `version` (required), plus a typo'd top-level key.
        'agentmark.json': JSON.stringify({ agentmarkPath: '.', builtInModels: ['openai/gpt-4o'], buildInModels: ['x'] }),
      }),
    );

    expect(statusOf(report, 'config.schema')).toBe('warn');
    expect(detailOf(report, 'config.schema')).toContain('version');
    expect(detailOf(report, 'config.schema')).toContain('buildInModels');
    expect(report.ok).toBe(true);
  });

  it('warns (does not fail) when no deployment handler exists', async () => {
    const files = { ...HEALTHY };
    delete (files as Record<string, string>)['handler.ts'];
    const report = await run(makeProject(files));

    expect(statusOf(report, 'deploy.handler')).toBe('warn');
    expect(detailOf(report, 'deploy.handler')).toContain('handler.ts');
    // A missing managed-deploy handler does not break the local setup.
    expect(report.ok).toBe(true);
  });

  it('fails when config.handler points to a file that does not exist', async () => {
    const files = { ...HEALTHY };
    delete (files as Record<string, string>)['handler.ts'];
    const report = await run(
      makeProject({
        ...files,
        'agentmark.json': JSON.stringify({
          version: '2.0.0',
          agentmarkPath: '.',
          builtInModels: ['openai/gpt-4o'],
          handler: 'src/handler.ts',
        }),
      }),
    );

    // An explicit pointer to a missing file is a definite bug, so it fails.
    expect(statusOf(report, 'deploy.handler')).toBe('fail');
    expect(detailOf(report, 'deploy.handler')).toContain('src/handler.ts');
    expect(report.ok).toBe(false);
  });

  it('passes deploy.handler when config.handler points to a real file', async () => {
    const files = { ...HEALTHY };
    delete (files as Record<string, string>)['handler.ts'];
    const report = await run(
      makeProject({
        ...files,
        'src/my-handler.ts': '// custom handler',
        'agentmark.json': JSON.stringify({
          version: '2.0.0',
          agentmarkPath: '.',
          builtInModels: ['openai/gpt-4o'],
          handler: 'src/my-handler.ts',
        }),
      }),
    );

    expect(statusOf(report, 'deploy.handler')).toBe('pass');
    // detail is `path.relative(cwd, handlerPath)`, so the separator is OS-native
    // (backslash on Windows). Build the expectation with path.join, not a literal.
    expect(detailOf(report, 'deploy.handler')).toContain(path.join('src', 'my-handler.ts'));
    expect(report.ok).toBe(true);
  });
});

describe('agentmark doctor — doctor() CLI glue (--json / exit codes)', () => {
  /**
   * Exercise the default export, which reads process.cwd()/process.env and calls
   * process.exit. Mock those + console.log to capture stdout and the exit code,
   * restoring all global state afterward.
   */
  async function runCli(
    dir: string,
    opts: { json?: boolean; strict?: boolean } = {},
    env: Record<string, string> = { AGENTMARK_API_KEY: 'k', AGENTMARK_APP_ID: 'a' },
  ): Promise<{ exitCode: number; stdout: string }> {
    const keys = ['AGENTMARK_API_KEY', 'AGENTMARK_APP_ID'];
    const saved: Record<string, string | undefined> = {};
    for (const k of keys) saved[k] = process.env[k];
    for (const k of keys) delete process.env[k];
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    // Mock cwd rather than process.chdir(): chdir is unsupported under vitest's
    // worker_threads pool (e.g. Stryker), and this avoids mutating global cwd.
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    });
    let exitCode = 0;
    try {
      await doctor(opts);
      // Read the captured exit code BEFORE mockRestore() clears the call history.
      exitCode = (exitSpy.mock.calls[0]?.[0] ?? 0) as number;
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k]!;
      }
      cwdSpy.mockRestore();
      exitSpy.mockRestore();
      logSpy.mockRestore();
    }
    return { exitCode, stdout: logs.join('\n') };
  }

  it('--json prints a parseable report whose ids survive serialization, and exits 0 when healthy', async () => {
    const { exitCode, stdout } = await runCli(makeProject(HEALTHY), { json: true });

    const parsed = JSON.parse(stdout) as DoctorReport;
    expect(parsed.ok).toBe(true);
    expect(parsed.counts.fail).toBe(0);
    // The id agents branch on round-trips through JSON intact.
    expect(parsed.results.find((r) => r.id === 'deploy.handler')?.status).toBe('pass');
    expect(exitCode).toBe(0);
  });

  it('exits 1 when a check fails', async () => {
    const files = { ...HEALTHY };
    delete (files as Record<string, string>)['agentmark.client.ts']; // client.file -> fail
    const { exitCode } = await runCli(makeProject(files));
    expect(exitCode).toBe(1);
  });

  it('a warn-only project exits 0 normally but 1 under --strict', async () => {
    // Empty builtInModels -> models.builtIn warns, nothing fails.
    const warnOnly = {
      ...HEALTHY,
      'agentmark.json': JSON.stringify({ version: '2.0.0', agentmarkPath: '.', builtInModels: [] }),
    };
    expect((await runCli(makeProject(warnOnly), {})).exitCode).toBe(0);
    expect((await runCli(makeProject(warnOnly), { strict: true })).exitCode).toBe(1);
  });
});
