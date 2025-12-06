/**
 * Key sanitization utilities to prevent prototype pollution attacks.
 *
 * These utilities filter out dangerous keys that could be used to
 * modify object prototypes when processing untrusted attribute data.
 */

/**
 * Set of keys that could cause prototype pollution if used as object properties
 */
export const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Check if a key is safe to use as an object property.
 * Returns false for keys that could cause prototype pollution.
 *
 * @param key - The key to check
 * @returns true if the key is safe, false otherwise
 */
export function isSafeKey(key: string): boolean {
  return !DANGEROUS_KEYS.has(key);
}
