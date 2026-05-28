/**
 * Stable, runtime-agnostic hash of a dataset row's input.
 *
 * Used as the join key when matching a live experiment run's rows against a
 * stored baseline run's rows for the regression gate. Both sides — the CLI's
 * live run path and the baseline lookup endpoints (local SQLite + cloud
 * ClickHouse) — must produce byte-identical output for identical inputs, so
 * the algorithm is intentionally pure JS:
 *
 *   - No crypto API: avoids `node:crypto` vs WebCrypto digest/availability
 *     differences across Node, Cloudflare Workers, and browsers.
 *   - Synchronous: the CLI hashes each row inside an already-hot streaming
 *     loop; an async digest would force awaits through that path.
 *   - Canonical key order: `{a:1,b:2}` and `{b:2,a:1}` hash the same, so row
 *     order and serialization quirks don't break matching.
 */

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    // `JSON.stringify(undefined)` is `undefined` (not a string); map it to a
    // stable sentinel so the function always returns a string.
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
    .join(",")}}`;
}

/**
 * FNV-1a (64-bit) over the canonical serialization, returned as zero-padded
 * 16-char hex. BigInt keeps the arithmetic identical across JS runtimes.
 */
export function hashRowInput(input: unknown): string {
  const str = canonicalize(input);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}
