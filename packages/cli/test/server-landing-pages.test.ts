import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFileServer } from '../src/file-server';
import { createWebhookServer } from '../src/runner-server';
import type { Server } from 'http';

// Test constants
const MIN_TEST_PORT_FILE = 40000; // Minimum port for file server tests
const MIN_TEST_PORT_RUNNER = 50000; // Minimum port for runner server tests
const PORT_RANGE = 10000; // Range of ports to randomize within

describe('Server Landing Pages', () => {
  let fileServer: Server;
  let webhookServer: Server;
  let fileServerPort: number;
  let webhookServerPort: number;

  beforeAll(async () => {
    // Use random ports to avoid conflicts
    fileServerPort = MIN_TEST_PORT_FILE + Math.floor(Math.random() * PORT_RANGE);
    webhookServerPort = MIN_TEST_PORT_RUNNER + Math.floor(Math.random() * PORT_RANGE);

    // Create mock runner for testing
    const mockHandler = {
      runPrompt: async () => ({ type: 'text' as const, text: 'test' }),
      runExperiment: async () => ({
        stream: new ReadableStream({
          start(controller) { controller.close(); }
        })
      })
    };

    fileServer = await createFileServer(fileServerPort) as Server;
    webhookServer = await createWebhookServer({
      port: webhookServerPort,
      runner: mockHandler,
      fileServerUrl: `http://localhost:${fileServerPort}`,
      templatesDirectory: process.cwd()
    }) as Server;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      fileServer.close(() => {
        webhookServer.close(() => resolve());
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

  it('webhook server shows HTML landing page on GET /', async () => {
    const response = await fetch(`http://localhost:${webhookServerPort}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('AgentMark CLI Runner');
    expect(html).toContain('Local development server for executing prompts and experiments');
    expect(html).toContain('prompt-run');
    expect(html).toContain('dataset-run');
    expect(html).toContain('npm run prompt');
    expect(html).toContain('npm run experiment');
    expect(html).toContain('docs.agentmark.co');
  });

  it('file server landing page displays current port', async () => {
    const response = await fetch(`http://localhost:${fileServerPort}/`);
    const html = await response.text();

    expect(html).toContain(`Running on port ${fileServerPort}`);
  });

  it('webhook server landing page displays current port', async () => {
    const response = await fetch(`http://localhost:${webhookServerPort}/`);
    const html = await response.text();

    expect(html).toContain(`Running on port ${webhookServerPort}`);
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

  it('webhook server POST endpoint still works', async () => {
    // POST should still work for actual API calls
    const response = await fetch(`http://localhost:${webhookServerPort}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'unknown' })
    });

    expect(response.status).toBe(400); // Invalid event type
    const data = await response.json();
    expect(data).toHaveProperty('error');
  });
});
