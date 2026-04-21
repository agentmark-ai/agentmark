/**
 * Shared Zod refine helpers for adversarial-input hardening.
 *
 * Motivation: the Schemathesis fuzz run (24677056304) surfaced handler
 * timeouts on ClickHouse-backed endpoints caused by inputs ClickHouse's
 * client driver stalls on — specifically:
 *
 *   - JavaScript strings containing unpaired UTF-16 surrogates (e.g.
 *     `\udb14` without its low-surrogate pair). JS strings are UTF-16;
 *     ClickHouse stores UTF-8. Lone surrogates cannot encode to UTF-8 and
 *     cause the driver to stall mid-insert / mid-query.
 *
 *   - Dates outside ClickHouse's DateTime64 safe range. Years like 9416
 *     (year nine thousand four hundred sixteen) or 6382 overflow CH's
 *     internal representation and stall queries that compare against them.
 *
 * Applying these at the API boundary via Zod rejects adversarial inputs
 * fast (400) so ClickHouse never sees them. Used from `scores.ts`,
 * `traces.ts`, `sessions.ts`, `metrics.ts`, etc. — anywhere the gateway
 * forwards a query/insert to ClickHouse.
 *
 * Exported from the shared api-contract package so gateway, dashboard,
 * and anywhere else consuming the shared schemas get the same protection
 * without each call site having to remember.
 */

/**
 * Matches any string that is valid UTF-16 with all surrogates paired —
 * i.e. encodable to UTF-8 for ClickHouse without stalling the driver.
 *
 * A high surrogate (U+D800..U+DBFF) must be immediately followed by a low
 * surrogate (U+DC00..U+DFFF). Any lone high or lone low surrogate is
 * rejected.
 */
const VALID_UTF8_STRING = /^(?:[^\ud800-\udfff]|[\ud800-\udbff][\udc00-\udfff])*$/;

/**
 * Zod refine args — reject strings containing lone UTF-16 surrogates.
 *
 * Usage:
 *   z.string().refine(...noLoneSurrogates)
 */
export const noLoneSurrogates: readonly [(s: string) => boolean, { message: string }] = [
  (s) => VALID_UTF8_STRING.test(s),
  { message: "String contains invalid UTF-8 (unpaired surrogate characters)." },
] as const;

/**
 * Bounds for dates passed to ClickHouse DateTime64 columns.
 *
 * CH's DateTime64 nominally supports 1900-2299, but queries near the
 * edges overflow in practice. A conservative 1970..2200 range covers every
 * realistic consumer use case while staying well inside the safe zone.
 */
const MIN_CH_DATE_MS = Date.UTC(1970, 0, 1);
const MAX_CH_DATE_MS = Date.UTC(2200, 0, 1);

/**
 * Zod refine args — reject dates outside ClickHouse's safe range.
 *
 * Accepts ISO date strings (YYYY-MM-DD) or ISO datetimes (YYYY-MM-DDTHH:MM:SSZ).
 * Apply AFTER z.string().date() / z.string().datetime() — or to a raw
 * z.string() when the handler parses its own date format.
 *
 * Usage:
 *   z.string().date().refine(...reasonableChDate)
 */
export const reasonableChDate: readonly [(s: string) => boolean, { message: string }] = [
  (s) => {
    const ms = Date.parse(s);
    if (Number.isNaN(ms)) return false;
    return ms >= MIN_CH_DATE_MS && ms <= MAX_CH_DATE_MS;
  },
  { message: "Date must be a valid ISO date between 1970-01-01 and 2200-01-01." },
] as const;
