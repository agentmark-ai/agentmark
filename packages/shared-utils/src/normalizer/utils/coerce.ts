/**
 * Coerce an attribute value to a finite number, or `undefined` when it can't be.
 *
 * OTLP attribute values arrive as numbers (intValue/doubleValue) but JSON
 * serializers and some instrumentors stringify them, so a token count or a
 * temperature may be `12` or `"12"`. Non-numeric strings (`"abc"`), booleans,
 * objects, null and undefined all yield `undefined` so callers can treat
 * "absent" and "unparseable" uniformly.
 */
export function toNumber(value: unknown): number | undefined {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') {
        const n = Number(value);
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}
