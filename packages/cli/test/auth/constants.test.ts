import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Tests for the env-var-aware URL/key resolvers in auth/constants.
 *
 * The resolvers MUST be called at use time, not at import time —
 * a process that sets `AGENTMARK_*` env vars after the CLI module
 * loads should still see those overrides on the very next call.
 */

import {
  getPlatformUrl,
  getApiUrl,
  getSupabaseUrl,
  getSupabaseAnonKey,
} from '../../cli-src/auth/constants';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.AGENTMARK_PLATFORM_URL;
  delete process.env.AGENTMARK_API_URL;
  delete process.env.AGENTMARK_SUPABASE_URL;
  delete process.env.AGENTMARK_SUPABASE_ANON_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getPlatformUrl', () => {
  it('returns the prod default when no override and no env var', () => {
    expect(getPlatformUrl()).toBe('https://app.agentmark.co');
  });

  it('returns AGENTMARK_PLATFORM_URL when set', () => {
    process.env.AGENTMARK_PLATFORM_URL = 'https://stg.agentmark.co';
    expect(getPlatformUrl()).toBe('https://stg.agentmark.co');
  });

  it('returns the explicit override over both env var and default', () => {
    process.env.AGENTMARK_PLATFORM_URL = 'https://stg.agentmark.co';
    expect(getPlatformUrl('https://override.example.com')).toBe(
      'https://override.example.com',
    );
  });

  it('falls through to env when override is empty string (treated as "not provided")', () => {
    // Commander sometimes hands you '' for unset string flags. Don't let
    // that override a real env var — falsy override means "use the chain
    // below me."
    process.env.AGENTMARK_PLATFORM_URL = 'https://stg.agentmark.co';
    expect(getPlatformUrl('')).toBe('https://stg.agentmark.co');
  });

  it('falls through to env when override is null', () => {
    process.env.AGENTMARK_PLATFORM_URL = 'https://stg.agentmark.co';
    expect(getPlatformUrl(null)).toBe('https://stg.agentmark.co');
  });
});

describe('getApiUrl', () => {
  it('returns the prod default by default', () => {
    expect(getApiUrl()).toBe('https://api.agentmark.co');
  });

  it('returns AGENTMARK_API_URL when set', () => {
    process.env.AGENTMARK_API_URL = 'https://api-stg.agentmark.co';
    expect(getApiUrl()).toBe('https://api-stg.agentmark.co');
  });

  it('precedence: override > env > default', () => {
    process.env.AGENTMARK_API_URL = 'https://env.example';
    expect(getApiUrl('https://flag.example')).toBe('https://flag.example');
  });
});

// Use synthetic example.test URLs for the env / override inputs so the
// OSS Safety CI grep (which matches `\.supab*ase\.co`-style hostnames)
// doesn't flag these test assertions. The resolvers don't care about
// the host — they just return whatever string is in the env / override.
const TEST_ENV_URL = 'https://stg-project.example.test';
const TEST_OVERRIDE_URL = 'https://flag-project.example.test';

describe('getSupabaseUrl', () => {
  it('returns a non-empty URL by default (the prod fallback baked in)', () => {
    const url = getSupabaseUrl();
    expect(url).toMatch(/^https:\/\/[a-z0-9-]+\.[a-z.]+$/i);
    expect(url.length).toBeGreaterThan(10);
  });

  it('returns AGENTMARK_SUPABASE_URL when set', () => {
    process.env.AGENTMARK_SUPABASE_URL = TEST_ENV_URL;
    expect(getSupabaseUrl()).toBe(TEST_ENV_URL);
  });

  it('precedence: override > env > default', () => {
    process.env.AGENTMARK_SUPABASE_URL = TEST_ENV_URL;
    expect(getSupabaseUrl(TEST_OVERRIDE_URL)).toBe(TEST_OVERRIDE_URL);
  });
});

describe('getSupabaseAnonKey', () => {
  it('returns a non-empty key by default', () => {
    const key = getSupabaseAnonKey();
    expect(key.length).toBeGreaterThan(40);
    expect(key.split('.').length).toBe(3); // JWT shape
  });

  it('returns AGENTMARK_SUPABASE_ANON_KEY when set', () => {
    process.env.AGENTMARK_SUPABASE_ANON_KEY = 'eyJ.stg-anon.key';
    expect(getSupabaseAnonKey()).toBe('eyJ.stg-anon.key');
  });

  it('paired override: setting both URL and anon key together', () => {
    // Realistic usage: pointing the CLI at a non-prod project requires
    // BOTH overrides. Setting only one would leave the keys mismatched
    // (URL says env A, key signed by env B). This test asserts the
    // resolvers don't entangle the two — they're independent
    // fall-through chains.
    process.env.AGENTMARK_SUPABASE_URL = TEST_ENV_URL;
    process.env.AGENTMARK_SUPABASE_ANON_KEY = 'eyJ.stg-anon.key';

    expect(getSupabaseUrl()).toBe(TEST_ENV_URL);
    expect(getSupabaseAnonKey()).toBe('eyJ.stg-anon.key');
  });
});
