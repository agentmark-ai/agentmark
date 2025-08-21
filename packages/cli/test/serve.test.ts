import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import net from 'node:net';
import * as path from 'node:path';
import * as fs from 'node:fs';

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

describe('agentmark serve', () => {
  it('serves prompts list, prompt AST, and datasets via /v1/templates', async () => {
    const tmp = path.join(__dirname, '..', 'tmp-serve-' + Date.now());
    fs.mkdirSync(path.join(tmp, 'agentmark'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'agentmark.json'), JSON.stringify({ agentmarkPath: '.' }, null, 2));
    fs.writeFileSync(path.join(tmp, 'agentmark', 'demo.prompt.mdx'), '---\ntext_config:\n  model_name: gpt-4o\n---\n\n# Demo Prompt');
    fs.writeFileSync(path.join(tmp, 'agentmark', 'demo.jsonl'), JSON.stringify({ input: {}, expected_output: 'EXPECTED' }) + '\n');

    const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
    const port = await getFreePort();
    const child = spawn(process.execPath, [cli, 'serve', '--port', String(port)], { cwd: tmp, env: { ...process.env }, stdio: 'ignore' });
    await wait(1200);

    // /v1/prompts
    const listResp = await fetch(`http://localhost:${port}/v1/prompts`);
    expect(listResp.ok).toBe(true);
    const { paths } = await listResp.json() as any;
    expect(Array.isArray(paths)).toBe(true);
    // The init flow drops example prompts too; ensure array is non-empty and includes our demo when present
    expect(paths.length).toBeGreaterThan(0);

    // /v1/templates dataset stream
    const dsResp = await fetch(`http://localhost:${port}/v1/templates?path=demo.jsonl`);
    expect(dsResp.ok).toBe(true);
    const text = await dsResp.text();
    expect(text.trim().length).toBeGreaterThan(0);
    try { process.kill(child.pid!, 'SIGKILL'); } catch {}
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
