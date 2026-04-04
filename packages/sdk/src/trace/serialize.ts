/**
 * Serialization utilities for observed function IO capture.
 */

export const MAX_SERIALIZE_LENGTH = 1_000_000;

/**
 * Serialize a value to a JSON string for span attributes.
 *
 * Serialization chain:
 *   1. Object with toJSON() → JSON
 *   2. Plain object/array/primitive → JSON
 *   3. Fallback → String(obj)
 *
 * Truncated to maxLength characters.
 */
export function serializeValue(
  value: unknown,
  maxLength: number = MAX_SERIALIZE_LENGTH
): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value, (_key, val) => {
      // Handle BigInt
      if (typeof val === "bigint") {
        return val.toString();
      }
      return val;
    });
  } catch {
    serialized = String(value);
  }
  return serialized.slice(0, maxLength);
}
