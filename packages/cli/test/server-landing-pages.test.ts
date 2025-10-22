import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFileServer } from '../src/file-server';
import { createRunnerServer } from '../src/runner-server';
import type { Server } from 'http';

describe('Server Landing Pages', () => {
  let fileServer: Server;
  let runnerServer: Server;
  let fileServerPort: number;
  let runnerServerPort: number;

  beforeAll(async () => {
    // Use random ports to avoid conflicts
    fileServerPort = 40000 + Math.floor(Math.random() * 10000);
    runnerServerPort = 50000 + Math.floor(Math.random() * 10000);

    // Create mock runner for testing
    const mockRunner = {
      runPrompt: async () => ({ type: 'text' as const, text: 'test' }),
      runExperiment: async () => ({
        stream: new ReadableStream({
          start(controller) { controller.close(); }
        })
      })
    };

    fileServer = await createFileServer(fileServerPort) as Server;
    runnerServer = await createRunnerServer({
      port: runnerServerPort,
      runner: mockRunner,
      fileServerUrl: `http://localhost:${fileServerPort}`,
      templatesDirectory: process.cwd()
    }) as Server;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      fileServer.close(() => {
        runnerServer.close(() => resolve());
      });
    });
  });

  it('file server shows HTML landing page on GET /', async () => {
    const response = await fetch(`http://localhost:${fileServerPort}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('AgentMark File Server');
    expect(html).toContain('Local development server for serving prompts and datasets');
    expect(html).toContain('/v1/templates');
    expect(html).toContain('/v1/prompts');
    expect(html).toContain('docs.agentmark.co');
  });

  it('runner server shows HTML landing page on GET /', async () => {
    const response = await fetch(`http://localhost:${runnerServerPort}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('AgentMark CLI Runner');
    expect(html).toContain('Local development server for executing prompts and experiments');
    expect(html).toContain('prompt-run');
    expect(html).toContain('dataset-run');
    expect(html).toContain('agentmark run-prompt');
    expect(html).toContain('agentmark run-experiment');
    expect(html).toContain('docs.agentmark.co');
  });

  it('file server landing page displays current port', async () => {
    const response = await fetch(`http://localhost:${fileServerPort}/`);
    const html = await response.text();

    expect(html).toContain(`Running on port ${fileServerPort}`);
  });

  it('runner server landing page displays current port', async () => {
    const response = await fetch(`http://localhost:${runnerServerPort}/`);
    const html = await response.text();

    expect(html).toContain(`Running on port ${runnerServerPort}`);
  });

  it('file server API endpoints still work after adding landing page', async () => {
    const response = await fetch(`http://localhost:${fileServerPort}/v1/prompts`);

    // May return 500 if no agentmark directory exists, which is fine for testing
    // The important thing is the endpoint responds and doesn't show HTML
    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('application/json');

    if (response.status === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('paths');
      expect(Array.isArray(data.paths)).toBe(true);
    }
  });

  it('runner server POST endpoint still works after adding landing page', async () => {
    // POST should still work for actual API calls
    const response = await fetch(`http://localhost:${runnerServerPort}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'unknown' })
    });

    expect(response.status).toBe(400); // Invalid event type
    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  it('runner server landing page shows CLI command options dynamically', async () => {
    const response = await fetch(`http://localhost:${runnerServerPort}/`);
    const html = await response.text();

    // Check for run-prompt options (from actual commander definitions)
    expect(html).toContain('--props');
    expect(html).toContain('--props-file');
    expect(html).toContain('--server');

    // Check for run-experiment options (from actual commander definitions)
    expect(html).toContain('--format');
    expect(html).toContain('--skip-eval');
    expect(html).toContain('--threshold');

    // Check descriptions are present (from commander)
    expect(html).toContain('Props as JSON string');
    expect(html).toContain('Path to JSON or YAML file containing props');
    expect(html).toContain('Output format:');
    expect(html).toContain('Skip running evals');
    expect(html).toContain('pass percentage');
  });

  it('runner server landing page includes file server info', async () => {
    const response = await fetch(`http://localhost:${runnerServerPort}/`);
    const html = await response.text();

    expect(html).toContain('File Server:');
    expect(html).toContain(`http://localhost:${fileServerPort}`);
    expect(html).toContain('Templates Directory:');
  });
});
