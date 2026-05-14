import { createHash } from "node:crypto";

/**
 * Compute a stable identifier for a dataset row, derived from its input.
 *
 * The identifier survives row reordering, additions, and deletions in the
 * dataset — anything that doesn't change the row's *content* keeps the same
 * id. This is the property regression-vs-baseline comparisons need: the
 * same logical test case in two different runs must produce the same name
 * so the baseline lookup can match them.
 *
 * Format: first 12 hex characters of the MD5 digest of the row's input,
 * canonicalised with sorted keys at every level. This matches the Python
 * runner's implementation byte-for-byte so cross-runtime comparisons
 * (TS-emitted baseline vs. Python-emitted PR run, or vice versa) produce
 * matching identifiers.
 *
 * Falls back to the positional index as a string when the row has no
 * input — in that case there is nothing stable to hash, so positional is
 * the best we can do.
 *
 * Note: we use MD5 here for compatibility with the existing Python
 * implementation. MD5 is not used as a security primitive — it's used as a
 * non-cryptographic content fingerprint, which is its appropriate role.
 */
export function computeDatasetItemName(
  input: unknown,
  fallbackIndex: number
): string {
  if (input === undefined || input === null) {
    return String(fallbackIndex);
  }
  const canonical = canonicalJsonStringify(input);
  return createHash("md5").update(canonical).digest("hex").slice(0, 12);
}

/**
 * Stringify a value as canonical JSON with object keys sorted recursively.
 *
 * Differs from `JSON.stringify`:
 * - Object keys are sorted lexicographically at every level of nesting, so
 *   `{a: 1, b: 2}` and `{b: 2, a: 1}` produce the same output.
 * - Non-serializable values (functions, symbols, bigints, undefined) are
 *   coerced to strings via `String(value)`, matching Python's `default=str`
 *   behavior in `json.dumps`.
 *
 * Exported for testing and for callers that need the same canonicalisation
 * for purposes other than item-name hashing.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return JSON.stringify(String(undefined));

  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    return JSON.stringify(value);
  }
  if (t === "bigint" || t === "function" || t === "symbol") {
    return JSON.stringify(String(value));
  }

  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJsonStringify).join(",") + "]";
  }

  // Plain object — sort keys lexicographically and recurse.
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => {
    return JSON.stringify(k) + ":" + canonicalJsonStringify(obj[k]);
  });
  return "{" + parts.join(",") + "}";
}
