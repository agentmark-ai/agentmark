import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PKG_ROOT = path.join(__dirname, '..', '..');
const TMP_PREFIX = 'tmp-pyhandler-';

function makeTmpDir(): string {
  const dir = path.join(PKG_ROOT, `${TMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(dir, { recursive: true });
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

describe('Python handler.py generation via createPythonApp', () => {
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

  // ──────────────────────────────────────────────────────────────────────
  // handler.py creation for pydantic-ai adapter
  // ──────────────────────────────────────────────────────────────────────

  describe('pydantic-ai adapter', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTmpDir();
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should create handler.py when deploymentMode is cloud', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      expect(fs.existsSync(path.join(tmpDir, 'handler.py'))).toBe(true);
    });

    it('should generate handler with PydanticAIWebhookHandler for pydantic-ai adapter', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('PydanticAIWebhookHandler');
      expect(content).toContain('from agentmark_pydantic_ai_v0 import PydanticAIWebhookHandler');
    });

    it('should include agentmark_sdk import', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('from agentmark_sdk import AgentMarkSDK');
    });

    it('should include agentmark_client import', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('from agentmark_client import client');
    });

    it('should include SDK tracing initialization', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('sdk = AgentMarkSDK(');
      expect(content).toContain('os.environ.get("AGENTMARK_API_KEY"');
      expect(content).toContain('os.environ.get("AGENTMARK_APP_ID"');
      expect(content).toContain('os.environ.get("AGENTMARK_BASE_URL"');
      expect(content).toContain('sdk.init_tracing(disable_batch=True)');
    });

    it('should include async handler function', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('async def handler(request: dict)');
    });

    it('should handle prompt-run request type', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('req_type == "prompt-run"');
      expect(content).toContain('adapter.run_prompt(');
    });

    it('should handle dataset-run request type', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('req_type == "dataset-run"');
      expect(content).toContain('adapter.run_experiment(');
    });

    it('should raise ValueError for unknown request type', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('raise ValueError(f"Unknown request type: {req_type}")');
    });

    it('should instantiate PydanticAIWebhookHandler as the adapter', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('adapter = PydanticAIWebhookHandler(client)');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // handler.py creation for claude-agent-sdk adapter
  // ──────────────────────────────────────────────────────────────────────

  describe('claude-agent-sdk adapter', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTmpDir();
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should create handler.py when deploymentMode is cloud', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'claude-agent-sdk');

      expect(fs.existsSync(path.join(tmpDir, 'handler.py'))).toBe(true);
    });

    it('should generate handler with ClaudeAgentWebhookHandler for claude-agent-sdk adapter', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'claude-agent-sdk');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('ClaudeAgentWebhookHandler');
      expect(content).toContain('from agentmark_claude_agent_sdk_v0 import ClaudeAgentWebhookHandler');
    });

    it('should import from agentmark_claude_agent_sdk_v0 (not the old module name)', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'claude-agent-sdk');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('from agentmark_claude_agent_sdk_v0 import ClaudeAgentWebhookHandler');
      expect(content).not.toContain('ClaudeAgentSDKWebhookHandler');
      expect(content).not.toContain('from agentmark_claude_agent_sdk import ClaudeAgentSDKWebhookHandler');
    });

    it('should include SDK tracing initialization for claude-agent-sdk', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'claude-agent-sdk');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('sdk = AgentMarkSDK(');
      expect(content).toContain('sdk.init_tracing(disable_batch=True)');
    });

    it('should instantiate ClaudeAgentWebhookHandler as the adapter', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'claude-agent-sdk');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('adapter = ClaudeAgentWebhookHandler(client)');
    });

    it('should not reference PydanticAI when using claude-agent-sdk', { timeout: 15000 }, async () => {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'claude-agent-sdk');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).not.toContain('PydanticAI');
      expect(content).not.toContain('pydantic_ai');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // handler.py is NOT created for static mode
  // ──────────────────────────────────────────────────────────────────────

  it('should not create handler.py when deploymentMode is static', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'static', 'pydantic-ai');

      expect(fs.existsSync(path.join(tmpDir, 'handler.py'))).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should not create handler.py when deploymentMode is static with claude-agent-sdk', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'static', 'claude-agent-sdk');

      expect(fs.existsSync(path.join(tmpDir, 'handler.py'))).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // handler.py is preserved when it already exists
  // ──────────────────────────────────────────────────────────────────────

  it('should skip handler.py if it already exists', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    const handlerPath = path.join(tmpDir, 'handler.py');
    const existingContent = '# my custom Python handler -- do not overwrite\n';
    fs.writeFileSync(handlerPath, existingContent);
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(handlerPath, 'utf8');
      expect(content).toBe(existingContent);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // handler.py includes docstring documentation
  // ──────────────────────────────────────────────────────────────────────

  it('should include module-level docstring for handler.py', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('AgentMark handler for managed cloud deployments');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // handler.py passes stream and custom props correctly
  // ──────────────────────────────────────────────────────────────────────

  it('should pass shouldStream option for prompt-run', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('"shouldStream"');
      expect(content).toContain('"customProps"');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should pass experimentId and datasetPath for dataset-run', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'handler.py'), 'utf8');
      expect(content).toContain('"experimentId"');
      expect(content).toContain('"datasetPath"');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Python getMainPyContent', () => {
  // getMainPyContent is exported, so we can test it directly.

  it('should include pydantic-ai specific imports for pydantic-ai adapter', async () => {
    const { getMainPyContent } = await import('../../src/utils/examples/create-python-app');
    const content = getMainPyContent('pydantic-ai', 'cloud');

    // The bundled party-planner.prompt.mdx ships object_config (structured
    // attendee extraction), so main.py must use the object helpers — not text.
    expect(content).toContain('from agentmark_pydantic_ai_v0 import run_object_prompt');
    expect(content).toContain('from agentmark_client import client');
    expect(content).toContain('client.load_object_prompt');
  });

  it('should include claude-agent-sdk specific imports for claude-agent-sdk adapter', async () => {
    const { getMainPyContent } = await import('../../src/utils/examples/create-python-app');
    const content = getMainPyContent('claude-agent-sdk', 'cloud');

    // claude-agent-sdk uses traced_query for streaming, but the bundled prompt
    // is still object_config, so the load step must be load_object_prompt.
    expect(content).toContain('from agentmark_claude_agent_sdk_v0 import traced_query');
    expect(content).toContain('from agentmark_client import client');
    expect(content).toContain('client.load_object_prompt');
  });

  it('should load via FileLoader by name, not by manually opening dist JSON', async () => {
    const { getMainPyContent } = await import('../../src/utils/examples/create-python-app');
    const pyd = getMainPyContent('pydantic-ai', 'cloud');
    const claude = getMainPyContent('claude-agent-sdk', 'cloud');

    // `agentmark build` emits { ast, metadata } — FileLoader.load() unwraps
    // the AST internally, so scaffolded main.py should hand the prompt name
    // to the client, not open and parse the JSON itself. Teaching new users
    // the manual unwrap was the bug this template fix addresses.
    for (const content of [pyd, claude]) {
      expect(content).toContain("client.load_object_prompt(\"party-planner.prompt.mdx\")");
      expect(content).not.toContain('compiled["ast"]');
      expect(content).not.toContain('json.load(f)');
      expect(content).not.toContain('Path("dist/agentmark/');
      // The actionable build hint should still surface on FileNotFoundError.
      expect(content).toContain("Run 'npx agentmark build' first");
    }
  });

  it('should include cloud tracing init with env vars for cloud mode', async () => {
    const { getMainPyContent } = await import('../../src/utils/examples/create-python-app');
    const content = getMainPyContent('pydantic-ai', 'cloud');

    expect(content).toContain('os.environ.get("AGENTMARK_API_KEY"');
    expect(content).toContain('os.environ.get("AGENTMARK_APP_ID"');
    expect(content).not.toContain('base_url=');
  });

  it('should include local tracing init with localhost URL for static mode', async () => {
    const { getMainPyContent } = await import('../../src/utils/examples/create-python-app');
    const content = getMainPyContent('pydantic-ai', 'static');

    expect(content).toContain('base_url="http://localhost:9418"');
    expect(content).toContain('traces will be sent to local dev server');
  });
});

describe('Python agentmark_client.py generation', () => {
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

  it('should create agentmark_client.py with pydantic-ai client config', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'agentmark_client.py'), 'utf8');
      expect(content).toContain('create_pydantic_ai_client');
      expect(content).toContain('PydanticAIModelRegistry');
      expect(content).toContain('PydanticAIModelRegistry()');
      expect(content).toContain('register_providers');
      expect(content).not.toContain('create_default');
      expect(content).toContain('from agentmark_pydantic_ai_v0');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should create agentmark_client.py with claude-agent-sdk client config', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'claude-agent-sdk');

      const content = fs.readFileSync(path.join(tmpDir, 'agentmark_client.py'), 'utf8');
      expect(content).toContain('create_claude_agent_client');
      expect(content).toContain('ClaudeAgentModelRegistry');
      expect(content).toContain('ClaudeAgentModelRegistry()');
      expect(content).toContain('register_providers');
      expect(content).not.toContain('create_default');
      expect(content).toContain('from agentmark_claude_agent_sdk');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Python pyproject.toml generation', () => {
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

  it('should include pydantic-ai dependency in pyproject.toml for pydantic-ai adapter', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'pyproject.toml'), 'utf8');
      expect(content).toContain('agentmark-pydantic-ai');
      expect(content).toMatch(/"pydantic-ai(-slim\[openai\])?>=\d/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should include claude-agent-sdk dependency in pyproject.toml for claude-agent-sdk adapter', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'claude-agent-sdk');

      const content = fs.readFileSync(path.join(tmpDir, 'pyproject.toml'), 'utf8');
      expect(content).toContain('agentmark-claude-agent-sdk-v0');
      expect(content).toMatch(/"claude-agent-sdk>=\d/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should skip pyproject.toml for existing projects', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    const existingPyproject = '[project]\nname = "existing"\n';
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), existingPyproject);
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      // Pass projectInfo indicating existing project
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai', {
        isExistingProject: true,
        isExistingAgentmark: false,
        conflictingFiles: [],
        packageManager: null,
        pythonVenv: null,
      }, []);

      // pyproject.toml should remain unchanged
      const content = fs.readFileSync(path.join(tmpDir, 'pyproject.toml'), 'utf8');
      expect(content).toBe(existingPyproject);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Python .env generation', () => {
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

  it('should include OPENAI_API_KEY for pydantic-ai adapter', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, '.env'), 'utf8');
      expect(content).toContain('OPENAI_API_KEY');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should include ANTHROPIC_API_KEY for claude-agent-sdk adapter', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'claude-agent-sdk');

      const content = fs.readFileSync(path.join(tmpDir, '.env'), 'utf8');
      expect(content).toContain('ANTHROPIC_API_KEY');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should include provided API key value in .env', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, 'sk-test-my-key', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, '.env'), 'utf8');
      expect(content).toContain('sk-test-my-key');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Python README.md generation', () => {
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

  // Anchors the pip>=26.1 fix from /tmp/test-fix-scaffolder-2: a scaffolded
  // pydantic-ai project must direct users to upgrade pip before installing,
  // or pip 25.x trips "resolution-too-deep" on pydantic-ai-slim's transitive
  // graph (mcp/fastmcp/logfire). Without this README, the only place this
  // hint appears is in the CLI's transient "Get Started" output.
  it('should create README.md with pip>=26.1 upgrade instruction for pydantic-ai', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      expect(fs.existsSync(path.join(tmpDir, 'README.md'))).toBe(true);
      const content = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf8');
      expect(content).toMatch(/pip>=26\.1/);
      expect(content).toContain('pydantic-ai-slim[openai]');
      expect(content).toContain('OPENAI_API_KEY');
      // Must explain *why* the pip upgrade is required, not just dictate it.
      expect(content).toMatch(/resolution-too-deep|backtracking|transitive/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should create README.md with pip>=26.1 upgrade instruction for claude-agent-sdk', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'claude-agent-sdk');

      expect(fs.existsSync(path.join(tmpDir, 'README.md'))).toBe(true);
      const content = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf8');
      expect(content).toMatch(/pip>=26\.1/);
      expect(content).toContain('ANTHROPIC_API_KEY');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should not overwrite an existing README.md', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    const existingReadme = '# My Project\n\nDo not touch.\n';
    fs.writeFileSync(path.join(tmpDir, 'README.md'), existingReadme);
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf8');
      expect(content).toBe(existingReadme);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Python .agentmark/dev_server.py generation', () => {
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

  it('should create dev_server.py with pydantic-ai webhook server', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'pydantic-ai');

      const content = fs.readFileSync(path.join(tmpDir, '.agentmark', 'dev_server.py'), 'utf8');
      expect(content).toContain('from agentmark_pydantic_ai_v0 import create_webhook_server');
      expect(content).toContain('from agentmark_client import client');
      expect(content).toContain('create_webhook_server(client');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should create dev_server.py with claude-agent-sdk webhook server', { timeout: 15000 }, async () => {
    const tmpDir = makeTmpDir();
    try {
      await applyStandardMocks();
      const { createPythonApp } = await import('../../src/utils/examples/create-python-app');
      await createPythonApp('skip', tmpDir, '', 'cloud', 'claude-agent-sdk');

      const content = fs.readFileSync(path.join(tmpDir, '.agentmark', 'dev_server.py'), 'utf8');
      expect(content).toContain('from agentmark_claude_agent_sdk_v0 import create_webhook_server');
      expect(content).toContain('from agentmark_client import client');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
