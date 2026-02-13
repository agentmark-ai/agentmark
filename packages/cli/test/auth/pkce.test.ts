import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { generatePKCE, generateState } from '../../cli-src/auth/pkce';

/**
 * Helper: independently compute the S256 challenge for a given verifier.
 * This mirrors RFC 7636 Section 4.2:
 *   challenge = BASE64URL(SHA256(verifier))
 */
function computeS256Challenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;
const HEX_REGEX = /^[0-9a-f]+$/;

describe('generatePKCE', () => {
  it('should produce a verifier of at least 43 characters when called', () => {
    const { verifier } = generatePKCE();
    // RFC 7636 Section 4.1: code_verifier minimum length is 43 characters
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  it('should produce a verifier containing only base64url characters when called', () => {
    const { verifier } = generatePKCE();
    // base64url alphabet: A-Z, a-z, 0-9, hyphen, underscore (no +, /, =)
    expect(verifier).toMatch(BASE64URL_REGEX);
  });

  it('should produce a challenge containing only base64url characters when called', () => {
    const { challenge } = generatePKCE();
    expect(challenge).toMatch(BASE64URL_REGEX);
  });

  it('should produce a challenge that is the S256 hash of the verifier when called', () => {
    const { verifier, challenge } = generatePKCE();
    // Independently compute SHA-256 of verifier, base64url-encode it
    const expectedChallenge = computeS256Challenge(verifier);
    expect(challenge).toBe(expectedChallenge);
  });

  it('should produce the same challenge for the same verifier when hashed deterministically', () => {
    // Two calls should produce different verifiers (randomness), but hashing
    // the same verifier twice must yield identical challenges.
    const { verifier } = generatePKCE();
    const challengeA = computeS256Challenge(verifier);
    const challengeB = computeS256Challenge(verifier);
    expect(challengeA).toBe(challengeB);
  });

  it('should produce unique verifier and challenge pairs across two calls', () => {
    const pairA = generatePKCE();
    const pairB = generatePKCE();
    expect(pairA.verifier).not.toBe(pairB.verifier);
    expect(pairA.challenge).not.toBe(pairB.challenge);
  });
});

describe('generateState', () => {
  it('should return a 32-character hex string when called', () => {
    const state = generateState();
    expect(state).toHaveLength(32);
    expect(state).toMatch(HEX_REGEX);
  });

  it('should return a unique value on each call', () => {
    const stateA = generateState();
    const stateB = generateState();
    expect(stateA).not.toBe(stateB);
  });
});
