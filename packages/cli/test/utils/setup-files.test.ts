import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  clientFileName,
  clientFilePresent,
  clientNotFoundMessages,
  resolveDevEntry,
  devEntryNotFoundMessages,
  resolveHandler,
} from '../../cli-src/utils/setup-files';

const tmpDirs: string[] = [];
function mkProject(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-setup-'));
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

describe('clientFileName / clientFilePresent', () => {
  it('names the client file per language', () => {
    expect(clientFileName('typescript')).toBe('agentmark.client.ts');
    expect(clientFileName('python')).toBe('agentmark_client.py');
  });
  it('detects presence per language', () => {
    const dir = mkProject({ 'agentmark.client.ts': '' });
    expect(clientFilePresent(dir, 'typescript')).toBe(true);
    expect(clientFilePresent(dir, 'python')).toBe(false);
  });
});

describe('clientNotFoundMessages', () => {
  it('TS: names the file, points at the setup skill + docs, no em-dash', () => {
    const m = clientNotFoundMessages('typescript');
    expect(m).toHaveLength(2);
    expect(m[0]).toBe('Error: agentmark.client.ts not found in current directory.');
    expect(m[1]).toContain('AgentMark project root');
    expect(m[1]).toContain('Set up AgentMark in this project');
    expect(m[1]).toContain('https://docs.agentmark.co/getting-started/client-setup');
    expect(m.join(' ')).not.toContain('—');
  });
  it('Python: uses the Python file + "Python project root"', () => {
    const m = clientNotFoundMessages('python');
    expect(m[0]).toBe('Error: agentmark_client.py not found in current directory.');
    expect(m[1]).toContain('AgentMark Python project root');
  });
});

describe('resolveDevEntry (TypeScript)', () => {
  it('prefers a custom dev-server.ts', () => {
    const dir = mkProject({ 'dev-server.ts': '', 'dev-entry.ts': '' });
    expect(resolveDevEntry(dir, 'typescript')).toEqual({ exists: true, path: path.join(dir, 'dev-server.ts'), kind: 'custom' });
  });
  it('falls back to dev-entry.ts at the project root', () => {
    const dir = mkProject({ 'dev-entry.ts': '' });
    expect(resolveDevEntry(dir, 'typescript')).toEqual({ exists: true, path: path.join(dir, 'dev-entry.ts'), kind: 'default' });
  });
  it('falls back to the legacy .agentmark/dev-entry.ts', () => {
    const dir = mkProject({ '.agentmark/dev-entry.ts': '' });
    expect(resolveDevEntry(dir, 'typescript')).toEqual({ exists: true, path: path.join(dir, '.agentmark', 'dev-entry.ts'), kind: 'legacy' });
  });
  it('reports none when no entry exists', () => {
    expect(resolveDevEntry(mkProject(), 'typescript')).toEqual({ exists: false });
  });
});

describe('resolveDevEntry (Python)', () => {
  it('prefers a custom dev_server.py over .agentmark/dev_server.py', () => {
    const dir = mkProject({ 'dev_server.py': '', '.agentmark/dev_server.py': '' });
    expect(resolveDevEntry(dir, 'python').kind).toBe('custom');
  });
  it('falls back to .agentmark/dev_server.py', () => {
    const dir = mkProject({ '.agentmark/dev_server.py': '' });
    expect(resolveDevEntry(dir, 'python')).toEqual({ exists: true, path: path.join(dir, '.agentmark', 'dev_server.py'), kind: 'default' });
  });
  it('reports none when no entry exists', () => {
    expect(resolveDevEntry(mkProject(), 'python')).toEqual({ exists: false });
  });
});

describe('devEntryNotFoundMessages', () => {
  it('TS: headline + expected + remediation, no em-dash', () => {
    const m = devEntryNotFoundMessages('typescript');
    expect(m[0]).toBe('Error: No dev server entry point found.');
    expect(m[1]).toContain('dev-entry.ts');
    expect(m[2]).toContain('Set up AgentMark in this project');
    expect(m.join(' ')).not.toContain('—');
  });
  it('Python: headline names Python', () => {
    expect(devEntryNotFoundMessages('python')[0]).toBe('Error: No Python dev server entry point found.');
  });
});

describe('resolveHandler', () => {
  it('resolves a configured relative path and marks it fromConfig', () => {
    const dir = mkProject({ 'src/handler.ts': '' });
    expect(resolveHandler(dir, 'src/handler.ts')).toEqual({
      exists: true,
      path: path.join(dir, 'src', 'handler.ts'),
      fromConfig: true,
    });
  });
  it('reports a configured path that does not resolve, still fromConfig', () => {
    // A default handler.ts exists, but config points elsewhere: the config wins.
    const dir = mkProject({ 'handler.ts': '' });
    expect(resolveHandler(dir, 'src/missing.ts')).toEqual({ exists: false, path: undefined, fromConfig: true });
  });
  it('honors an absolute configured path', () => {
    const dir = mkProject({ 'handler.ts': '' });
    const abs = path.join(dir, 'handler.ts');
    expect(resolveHandler(dir, abs)).toEqual({ exists: true, path: abs, fromConfig: true });
  });
  it('falls back to handler.py before handler.ts when no path is configured', () => {
    const dir = mkProject({ 'handler.py': '', 'handler.ts': '' });
    expect(resolveHandler(dir)).toEqual({ exists: true, path: path.join(dir, 'handler.py'), fromConfig: false });
  });
  it('falls back to handler.ts when only it exists', () => {
    const dir = mkProject({ 'handler.ts': '' });
    expect(resolveHandler(dir)).toEqual({ exists: true, path: path.join(dir, 'handler.ts'), fromConfig: false });
  });
  it('reports none, not fromConfig, when nothing resolves', () => {
    expect(resolveHandler(mkProject())).toEqual({ exists: false, fromConfig: false });
  });
  it('treats a blank configured path as unset and uses the defaults', () => {
    const dir = mkProject({ 'handler.ts': '' });
    expect(resolveHandler(dir, '   ')).toEqual({ exists: true, path: path.join(dir, 'handler.ts'), fromConfig: false });
  });
});
