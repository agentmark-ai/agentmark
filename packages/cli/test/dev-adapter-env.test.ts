import { describe, it, expect } from 'vitest';
import { buildAdapterEnv, hasCloudCreds } from '../cli-src/commands/dev-env';

// This repo augments NodeJS.ProcessEnv to require NODE_ENV, so a bare object
// literal isn't assignable. `env()` builds a ProcessEnv-typed value from a
// partial for the test cases (production always passes the real `process.env`).
const env = (overrides: Record<string, string | undefined>): NodeJS.ProcessEnv =>
  overrides as NodeJS.ProcessEnv;

describe('dev adapter env (local-mode isolation)', () => {
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

  describe('buildAdapterEnv', () => {
    it('strips the cloud creds so the client stays in local mode', () => {
      const out = buildAdapterEnv(
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
      expect(buildAdapterEnv(env({}), 9418).AGENTMARK_DEV_SERVER).toBe('http://localhost:9418');
      // honors a custom --api-port
      expect(buildAdapterEnv(env({}), 4321).AGENTMARK_DEV_SERVER).toBe('http://localhost:4321');
    });

    it('overrides an inherited AGENTMARK_DEV_SERVER with this server', () => {
      const out = buildAdapterEnv(env({ AGENTMARK_DEV_SERVER: 'http://localhost:1111' }), 9418);
      expect(out.AGENTMARK_DEV_SERVER).toBe('http://localhost:9418');
    });

    it('preserves unrelated env vars', () => {
      const out = buildAdapterEnv(
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
      buildAdapterEnv(input, 9418);
      expect(input.AGENTMARK_API_KEY).toBe('secret-key');
      expect(input.AGENTMARK_APP_ID).toBe('app-123');
      expect(input.AGENTMARK_BASE_URL).toBe('https://api.agentmark.co');
      expect(input).not.toHaveProperty('AGENTMARK_DEV_SERVER');
    });
  });
});
