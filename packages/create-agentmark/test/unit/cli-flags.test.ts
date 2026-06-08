import { describe, it, expect } from 'vitest';
import { parseArgs, ALL_CLIENTS } from '../../src/index.js';

/**
 * Direct tests against the exported `parseArgs` — the function takes an
 * argv array as input, so we don't need to monkey-patch `process.argv`.
 * The CLI entry path is guarded against direct invocation in test contexts
 * (see `isDirectlyInvoked` in src/index.ts), so importing this module here
 * does not execute `main()`.
 */
describe('parseArgs', () => {
  describe('--path', () => {
    it('parses --path with explicit value', () => {
      const result = parseArgs(['--path', '/tmp/my-app']);
      expect(result.path).toBe('/tmp/my-app');
    });

    it('accepts "." for current directory', () => {
      const result = parseArgs(['--path', '.']);
      expect(result.path).toBe('.');
    });
  });

  describe('positional folder argument', () => {
    it('treats a non-flag argument as the folder name', () => {
      const result = parseArgs(['my-app']);
      expect(result.path).toBe('my-app');
    });

    it('lets --path win over a later positional argument', () => {
      const result = parseArgs(['--path', '/explicit', 'other-folder']);
      expect(result.path).toBe('/explicit');
    });

    it('lets the first positional win over a later positional', () => {
      const result = parseArgs(['first', 'second']);
      expect(result.path).toBe('first');
    });

    it('does not confuse "--" prefix arguments with positional folder names', () => {
      const result = parseArgs(['--overwrite']);
      expect(result.path).toBeUndefined();
      expect(result.overwrite).toBe(true);
    });
  });

  describe('--client', () => {
    it('parses a single client value', () => {
      const result = parseArgs(['--client', 'cursor']);
      expect(result.clients).toEqual(['cursor']);
    });

    it('parses comma-separated clients in one --client', () => {
      const result = parseArgs(['--client', 'claude-code,cursor,vscode']);
      expect(result.clients).toEqual(['claude-code', 'cursor', 'vscode']);
    });

    it('concatenates repeated --client flags', () => {
      const result = parseArgs(['--client', 'cursor', '--client', 'zed']);
      expect(result.clients).toEqual(['cursor', 'zed']);
    });

    it('expands "all" into every known client', () => {
      const result = parseArgs(['--client', 'all']);
      expect(result.clients).toEqual([...ALL_CLIENTS]);
    });

    it('trims whitespace around comma-separated values', () => {
      const result = parseArgs(['--client', 'cursor, vscode , zed']);
      expect(result.clients).toEqual(['cursor', 'vscode', 'zed']);
    });

    it('throws when --client is given no value', () => {
      expect(() => parseArgs(['--client'])).toThrow(/--client requires a value/);
    });
  });

  describe('--overwrite', () => {
    it('sets overwrite to true', () => {
      const result = parseArgs(['--overwrite']);
      expect(result.overwrite).toBe(true);
    });

    it('defaults overwrite to undefined when absent', () => {
      const result = parseArgs([]);
      expect(result.overwrite).toBeUndefined();
    });
  });

  describe('--api-url', () => {
    it('accepts a full http URL', () => {
      const result = parseArgs(['--api-url', 'http://localhost:9418']);
      expect(result.apiUrl).toBe('http://localhost:9418');
    });

    it('accepts a full https URL', () => {
      const result = parseArgs(['--api-url', 'https://api-stg.agentmark.co']);
      expect(result.apiUrl).toBe('https://api-stg.agentmark.co');
    });

    it('rejects a missing value', () => {
      expect(() => parseArgs(['--api-url'])).toThrow(/--api-url requires a full http\(s\) URL/);
    });

    it('rejects a non-URL value (no scheme)', () => {
      expect(() => parseArgs(['--api-url', 'api.agentmark.co'])).toThrow(/--api-url requires/);
    });

    it('rejects a relative path', () => {
      expect(() => parseArgs(['--api-url', '/v1/openapi.json'])).toThrow(/--api-url requires/);
    });
  });

  describe('removed flags (no longer accepted)', () => {
    /**
     * Pre-1.0 the CLI had --language, --adapter, --python, --typescript,
     * --cloud, --self-host, --api-key. These were removed when the CLI
     * stopped scaffolding example code. The parser should silently ignore
     * them (rather than crash), so an old script invocation produces an
     * empty config the same as `npm create agentmark` with no flags.
     */
    it('does not parse --python', () => {
      const result = parseArgs(['--python']);
      expect(result).not.toHaveProperty('language');
    });

    it('does not parse --adapter', () => {
      const result = parseArgs(['--adapter', 'ai-sdk']);
      expect(result).not.toHaveProperty('adapter');
    });

    it('does not parse --api-key', () => {
      const result = parseArgs(['--api-key', 'sk-test-123']);
      expect(result).not.toHaveProperty('apiKey');
    });

    it('does not parse --cloud / --self-host', () => {
      const result = parseArgs(['--cloud', '--self-host']);
      expect(result).not.toHaveProperty('deploymentMode');
    });
  });

  describe('--yes / -y', () => {
    it('parses --yes', () => {
      const result = parseArgs(['--yes']);
      expect(result).toEqual({ yes: true });
    });

    it('parses the -y short form', () => {
      const result = parseArgs(['-y']);
      expect(result).toEqual({ yes: true });
    });

    it('defaults yes to undefined when absent', () => {
      const result = parseArgs([]);
      expect(result.yes).toBeUndefined();
    });

    it('does not treat -y as a positional folder name', () => {
      const result = parseArgs(['-y']);
      expect(result.path).toBeUndefined();
    });
  });

  describe('--help / -h', () => {
    it('parses --help', () => {
      const result = parseArgs(['--help']);
      expect(result).toEqual({ help: true });
    });

    it('parses the -h short form', () => {
      const result = parseArgs(['-h']);
      expect(result).toEqual({ help: true });
    });

    it('does not treat -h as a positional folder name', () => {
      const result = parseArgs(['-h']);
      expect(result.path).toBeUndefined();
    });
  });

  describe('combined flags', () => {
    it('parses a non-interactive bundle without throwing', () => {
      const result = parseArgs([
        '--path', './my-project',
        '--client', 'all',
        '--overwrite',
      ]);
      expect(result).toEqual({
        path: './my-project',
        clients: [...ALL_CLIENTS],
        overwrite: true,
      });
    });

    it('parses the one-flag headless bundle: folder + --yes', () => {
      const result = parseArgs(['my-app', '--yes']);
      expect(result).toEqual({ path: 'my-app', yes: true });
    });
  });
});
