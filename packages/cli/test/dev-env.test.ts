import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { buildDevServerEnv, buildPythonDevEnv, hasCloudCreds } from '../cli-src/commands/dev-env';

// This repo augments NodeJS.ProcessEnv to require NODE_ENV, so a bare object
// literal isn't assignable. `env()` builds a ProcessEnv-typed value from a
// partial for the test cases (production always passes the real `process.env`).
const env = (overrides: Record<string, string | undefined>): NodeJS.ProcessEnv =>
  overrides as NodeJS.ProcessEnv;

describe('dev server env (local-mode isolation)', () => {
  describe('hasCloudCreds', () => {
    it('is true only when both API key and app id are present', () => {
      expect(hasCloudCreds(env({ AGENTMARK_API_KEY: 'k', AGENTMARK_APP_ID: 'a' }))).toBe(true);
      expect(hasCloudCreds(env({ AGENTMARK_API_KEY: 'k' }))).toBe(false);
      expect(hasCloudCreds(env({ AGENTMARK_APP_ID: 'a' }))).toBe(false);
      expect(hasCloudCreds(env({}))).toBe(false);
    });

    it('treats empty-string creds as absent (an empty key never authenticates)', () => {
      expect(hasCloudCreds(env({ AGENTMARK_API_KEY: '', AGENTMARK_APP_ID: '' }))).toBe(false);
      expect(hasCloudCreds(env({ AGENTMARK_API_KEY: 'k', AGENTMARK_APP_ID: '' }))).toBe(false);
    });
  });

  describe('buildDevServerEnv', () => {
    it('strips the cloud creds so the client stays in local mode', () => {
      const out = buildDevServerEnv(
        env({
          AGENTMARK_API_KEY: 'secret-key',
          AGENTMARK_APP_ID: 'app-123',
          AGENTMARK_BASE_URL: 'https://api.agentmark.co',
        }),
        9418,
      );
      expect(out).not.toHaveProperty('AGENTMARK_API_KEY');
      expect(out).not.toHaveProperty('AGENTMARK_APP_ID');
      expect(out).not.toHaveProperty('AGENTMARK_BASE_URL');
    });

    it('pins AGENTMARK_DEV_SERVER to the local API server port', () => {
      expect(buildDevServerEnv(env({}), 9418).AGENTMARK_DEV_SERVER).toBe('http://localhost:9418');
      // honors a custom --api-port
      expect(buildDevServerEnv(env({}), 4321).AGENTMARK_DEV_SERVER).toBe('http://localhost:4321');
    });

    it('overrides an inherited AGENTMARK_DEV_SERVER with this server', () => {
      const out = buildDevServerEnv(env({ AGENTMARK_DEV_SERVER: 'http://localhost:1111' }), 9418);
      expect(out.AGENTMARK_DEV_SERVER).toBe('http://localhost:9418');
    });

    it('preserves unrelated env vars', () => {
      const out = buildDevServerEnv(
        env({ PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-ant', OPENAI_API_KEY: 'sk-oai' }),
        9418,
      );
      expect(out.PATH).toBe('/usr/bin');
      expect(out.ANTHROPIC_API_KEY).toBe('sk-ant');
      expect(out.OPENAI_API_KEY).toBe('sk-oai');
    });

    it('does not mutate the input env (must not clobber process.env)', () => {
      const input = env({
        AGENTMARK_API_KEY: 'secret-key',
        AGENTMARK_APP_ID: 'app-123',
        AGENTMARK_BASE_URL: 'https://api.agentmark.co',
      });
      buildDevServerEnv(input, 9418);
      expect(input.AGENTMARK_API_KEY).toBe('secret-key');
      expect(input.AGENTMARK_APP_ID).toBe('app-123');
      expect(input.AGENTMARK_BASE_URL).toBe('https://api.agentmark.co');
      expect(input).not.toHaveProperty('AGENTMARK_DEV_SERVER');
    });
  });
});

describe('buildPythonDevEnv', () => {
  const base = { AGENTMARK_DEV_SERVER: 'http://localhost:9418' } as NodeJS.ProcessEnv;

  it('prepends the project root to PYTHONPATH so root-level imports resolve (issue #8)', () => {
    const env = buildPythonDevEnv({ ...base }, '/proj');
    expect(env.PYTHONPATH).toBe('/proj');

    const withExisting = buildPythonDevEnv({ ...base, PYTHONPATH: '/site' }, '/proj');
    expect(withExisting.PYTHONPATH).toBe(`/proj${path.delimiter}/site`);
  });

  it('redirects the bytecode cache to a per-run temp dir and disables writes (issue #11)', () => {
    const env = buildPythonDevEnv({ ...base }, '/proj');
    expect(env.PYTHONDONTWRITEBYTECODE).toBe('1');
    expect(env.PYTHONUNBUFFERED).toBe('1');
    // Reading from the project __pycache__ is what masked source edits — the
    // prefix must point OUTSIDE the project.
    expect(env.PYTHONPYCACHEPREFIX).toBe(path.join(os.tmpdir(), `agentmark-dev-pyc-${process.pid}`));
  });
});
