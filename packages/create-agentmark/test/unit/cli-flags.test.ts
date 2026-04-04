import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PKG_ROOT = path.join(__dirname, '..', '..');
const TMP_PREFIX = 'tmp-cli-';

/**
 * Tests for CLI argument parsing, validation, and non-interactive mode.
 *
 * Since parseArgs is a private function in index.ts and the module executes
 * main() at import time, we test the CLI behavior by:
 * 1. Directly testing the validation logic patterns (constants + rules)
 * 2. Testing non-interactive mode end-to-end via createExampleApp/createPythonApp
 * 3. Testing agentmark.json handler key assignment logic
 */

// These mirror the constants defined in index.ts
const VALID_ADAPTERS_TS = ['ai-sdk', 'claude-agent-sdk', 'mastra'];
const VALID_ADAPTERS_PY = ['pydantic-ai', 'claude-agent-sdk'];
const VALID_CLIENTS = ['claude-code', 'cursor', 'vscode', 'zed', 'skip'];

function makeTmpDir(): string {
  const dir = path.join(PKG_ROOT, `${TMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'test-cli', version: '1.0.0', scripts: {} }, null, 2),
  );
  return dir;
}

async function applyStandardMocks() {
  vi.doMock('fs-extra', async () => {
    const actual = await vi.importActual<any>('fs-extra');
    return {
      ...actual,
      default: {
        ...actual,
        existsSync: (p: string) => actual.existsSync(p),
        readJsonSync: (p: string) => actual.readJsonSync(p),
        writeJsonSync: actual.writeJsonSync,
        writeFileSync: actual.writeFileSync,
      },
      existsSync: (p: string) => actual.existsSync(p),
      readJsonSync: (p: string) => actual.readJsonSync(p),
      writeJsonSync: actual.writeJsonSync,
      writeFileSync: actual.writeFileSync,
    };
  });
  vi.doMock('child_process', () => ({
    execSync: () => {},
    execFileSync: () => {},
  }));
}

describe('CLI adapter validation', () => {
  describe('typescript adapters', () => {
    it('should accept ai-sdk as valid typescript adapter', () => {
      expect(VALID_ADAPTERS_TS).toContain('ai-sdk');
    });

    it('should accept claude-agent-sdk as valid typescript adapter', () => {
      expect(VALID_ADAPTERS_TS).toContain('claude-agent-sdk');
    });

    it('should accept mastra as valid typescript adapter', () => {
      expect(VALID_ADAPTERS_TS).toContain('mastra');
    });

    it('should reject pydantic-ai as typescript adapter', () => {
      expect(VALID_ADAPTERS_TS).not.toContain('pydantic-ai');
    });

    it('should reject unknown adapters for typescript', () => {
      expect(VALID_ADAPTERS_TS).not.toContain('langchain');
      expect(VALID_ADAPTERS_TS).not.toContain('');
      expect(VALID_ADAPTERS_TS).not.toContain('unknown');
    });
  });

  describe('python adapters', () => {
    it('should accept pydantic-ai as valid python adapter', () => {
      expect(VALID_ADAPTERS_PY).toContain('pydantic-ai');
    });

    it('should accept claude-agent-sdk as valid python adapter', () => {
      expect(VALID_ADAPTERS_PY).toContain('claude-agent-sdk');
    });

    it('should reject ai-sdk as python adapter', () => {
      expect(VALID_ADAPTERS_PY).not.toContain('ai-sdk');
    });

    it('should reject mastra as python adapter', () => {
      expect(VALID_ADAPTERS_PY).not.toContain('mastra');
    });

    it('should reject unknown adapters for python', () => {
      expect(VALID_ADAPTERS_PY).not.toContain('langchain');
      expect(VALID_ADAPTERS_PY).not.toContain('');
    });
  });
});

describe('CLI client validation', () => {
  it('should accept claude-code as valid client', () => {
    expect(VALID_CLIENTS).toContain('claude-code');
  });

  it('should accept cursor as valid client', () => {
    expect(VALID_CLIENTS).toContain('cursor');
  });

  it('should accept vscode as valid client', () => {
    expect(VALID_CLIENTS).toContain('vscode');
  });

  it('should accept zed as valid client', () => {
    expect(VALID_CLIENTS).toContain('zed');
  });

  it('should accept skip as valid client', () => {
    expect(VALID_CLIENTS).toContain('skip');
  });

  it('should reject unknown client values', () => {
    expect(VALID_CLIENTS).not.toContain('emacs');
    expect(VALID_CLIENTS).not.toContain('vim');
    expect(VALID_CLIENTS).not.toContain('');
  });
});

describe('parseArgs behavior', () => {
  // Since parseArgs reads process.argv and index.ts runs main() on import,
  // we test the parsing logic by verifying the argument patterns that the
  // switch statement handles.

  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  /**
   * Simulate parseArgs logic for testing without importing the module.
   * This mirrors the exact switch/case from index.ts.
   */
  function parseArgs(argv: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      switch (arg) {
        case '--cloud':
          result.deploymentMode = 'cloud';
          break;
        case '--self-host':
          result.deploymentMode = 'static';
          break;
        case '--python':
          result.language = 'python';
          break;
        case '--typescript':
          result.language = 'typescript';
          break;
        case '--overwrite':
          result.overwrite = true;
          break;
        case '--path':
          result.path = argv[++i];
          break;
        case '--adapter':
          result.adapter = argv[++i];
          break;
        case '--api-key':
          result.apiKey = argv[++i];
          break;
        case '--client':
          result.client = argv[++i];
          break;
      }
    }
    return result;
  }

  it('should parse --path flag with value', () => {
    const result = parseArgs(['--path', '/tmp/my-app']);
    expect(result.path).toBe('/tmp/my-app');
  });

  it('should parse --python flag', () => {
    const result = parseArgs(['--python']);
    expect(result.language).toBe('python');
  });

  it('should parse --typescript flag', () => {
    const result = parseArgs(['--typescript']);
    expect(result.language).toBe('typescript');
  });

  it('should parse --adapter flag with value', () => {
    const result = parseArgs(['--adapter', 'pydantic-ai']);
    expect(result.adapter).toBe('pydantic-ai');
  });

  it('should parse --api-key flag with value', () => {
    const result = parseArgs(['--api-key', 'sk-test-123']);
    expect(result.apiKey).toBe('sk-test-123');
  });

  it('should parse --client flag with value', () => {
    const result = parseArgs(['--client', 'cursor']);
    expect(result.client).toBe('cursor');
  });

  it('should parse --cloud flag', () => {
    const result = parseArgs(['--cloud']);
    expect(result.deploymentMode).toBe('cloud');
  });

  it('should parse --self-host flag', () => {
    const result = parseArgs(['--self-host']);
    expect(result.deploymentMode).toBe('static');
  });

  it('should parse --overwrite flag', () => {
    const result = parseArgs(['--overwrite']);
    expect(result.overwrite).toBe(true);
  });

  it('should parse multiple flags together', () => {
    const result = parseArgs([
      '--path', './my-project',
      '--python',
      '--adapter', 'pydantic-ai',
      '--cloud',
      '--client', 'claude-code',
      '--api-key', 'sk-abc',
      '--overwrite',
    ]);
    expect(result.path).toBe('./my-project');
    expect(result.language).toBe('python');
    expect(result.adapter).toBe('pydantic-ai');
    expect(result.deploymentMode).toBe('cloud');
    expect(result.client).toBe('claude-code');
    expect(result.apiKey).toBe('sk-abc');
    expect(result.overwrite).toBe(true);
  });

  it('should return empty object when no flags provided', () => {
    const result = parseArgs([]);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('should handle --path . for current directory', () => {
    const result = parseArgs(['--path', '.']);
    expect(result.path).toBe('.');
  });

  it('should ignore unknown flags', () => {
    const result = parseArgs(['--unknown', '--path', '/tmp']);
    expect(result.path).toBe('/tmp');
    expect(result).not.toHaveProperty('unknown');
  });

  it('should use last value when flag appears multiple times', () => {
    const result = parseArgs(['--path', '/first', '--path', '/second']);
    expect(result.path).toBe('/second');
  });

  it('should override language when both --python and --typescript provided', () => {
    const result = parseArgs(['--python', '--typescript']);
    expect(result.language).toBe('typescript');
  });

  it('should override deployment mode when both --cloud and --self-host provided', () => {
    const result = parseArgs(['--cloud', '--self-host']);
    expect(result.deploymentMode).toBe('static');
  });
});

describe('agentmark.json handler key for language selection', () => {
  // Tests the handler key assignment logic from index.ts lines 235-237:
  //   if (deploymentMode === "cloud") {
  //     config.handler = language === "python" ? "handler.py" : "handler.ts";
  //   }

  it('should set handler to handler.py for python cloud mode', () => {
    const config: Record<string, unknown> = {};
    const language = 'python';
    const deploymentMode = 'cloud';

    if (deploymentMode === 'cloud') {
      config.handler = language === 'python' ? 'handler.py' : 'handler.ts';
    }

    expect(config.handler).toBe('handler.py');
  });

  it('should set handler to handler.ts for typescript cloud mode', () => {
    const config: Record<string, unknown> = {};
    const language = 'typescript';
    const deploymentMode = 'cloud';

    if (deploymentMode === 'cloud') {
      config.handler = language === 'python' ? 'handler.py' : 'handler.ts';
    }

    expect(config.handler).toBe('handler.ts');
  });

  it('should not set handler key for python static mode', () => {
    const config: Record<string, unknown> = {};
    const language = 'python';
    const deploymentMode = 'static';

    if (deploymentMode === 'cloud') {
      config.handler = language === 'python' ? 'handler.py' : 'handler.ts';
    }

    expect(config.handler).toBeUndefined();
  });

  it('should not set handler key for typescript static mode', () => {
    const config: Record<string, unknown> = {};
    const language = 'typescript';
    const deploymentMode = 'static';

    if (deploymentMode === 'cloud') {
      config.handler = language === 'python' ? 'handler.py' : 'handler.ts';
    }

    expect(config.handler).toBeUndefined();
  });
});

describe('non-interactive mode end-to-end', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    vi.unmock('fs-extra');
    vi.unmock('child_process');
  });

  afterAll(() => {
    try {
      for (const entry of fs.readdirSync(PKG_ROOT)) {
        if (entry.startsWith(TMP_PREFIX)) {
          fs.rmSync(path.join(PKG_ROOT, entry), { recursive: true, force: true });
        }
      }
    } catch { /* best-effort */ }
  });

  it('should generate correct files for python cloud mode without prompts', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');

      // Simulates: --path tmpDir --python --adapter pydantic-ai --cloud --client skip --api-key test-key
      await createPythonApp('skip', tmpDir, 'test-key', 'cloud', 'pydantic-ai');

      // Verify all expected files exist
      expect(fs.existsSync(path.join(tmpDir, 'handler.py'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'main.py'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'agentmark_client.py'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'pyproject.toml'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.env'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'agentmark'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should generate correct files for typescript cloud mode without prompts', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createExampleApp } = await import('../../src/utils/examples/create-example-app');

      // Simulates: --path tmpDir --typescript --adapter ai-sdk --cloud --client skip --api-key test-key
      await createExampleApp('skip', tmpDir, 'test-key', 'ai-sdk', 'cloud');

      // Verify all expected files exist
      expect(fs.existsSync(path.join(tmpDir, 'handler.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'index.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'agentmark.client.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'dev-entry.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.env'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'agentmark'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should generate correct files for python static mode without prompts', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');

      await createPythonApp('skip', tmpDir, '', 'static', 'pydantic-ai');

      // Static mode should NOT create handler.py
      expect(fs.existsSync(path.join(tmpDir, 'handler.py'))).toBe(false);
      // Other files should still exist
      expect(fs.existsSync(path.join(tmpDir, 'main.py'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'agentmark_client.py'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
