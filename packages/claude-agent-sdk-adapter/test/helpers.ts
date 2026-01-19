/**
 * Test helpers for stable span lookup and common test utilities
 */

/**
 * Mock span data interface for type safety
 */
export interface MockSpanData {
  name: string;
  attributes: Record<string, string | number | boolean>;
  status?: { code: number; message?: string };
  exceptions: Error[];
  events: Array<{ name: string; attributes?: Record<string, string | number | boolean> }>;
  ended: boolean;
}

/**
 * Find a span by name using exact match or regex pattern.
 * Stable alternative to index-based lookup that prevents flaky tests.
 *
 * @param spans - Array of mock spans to search
 * @param namePattern - String for exact match or RegExp for pattern match
 * @returns The first matching span or undefined
 */
export function findSpanByName<T extends { name: string }>(
  spans: T[],
  namePattern: string | RegExp
): T | undefined {
  return spans.find(s =>
    typeof namePattern === "string"
      ? s.name === namePattern
      : namePattern.test(s.name)
  );
}

/**
 * Find a span by an attribute key-value pair.
 * Useful for finding specific tool or session spans.
 *
 * @param spans - Array of mock spans to search
 * @param key - Attribute key to match
 * @param value - Expected attribute value
 * @returns The first matching span or undefined
 */
export function findSpanByAttribute<T extends { attributes: Record<string, unknown> }>(
  spans: T[],
  key: string,
  value: unknown
): T | undefined {
  return spans.find(s => s.attributes[key] === value);
}

/**
 * Find all spans matching a name pattern.
 * Useful for finding multiple tool spans or chat spans.
 *
 * @param spans - Array of mock spans to search
 * @param namePattern - String for exact match or RegExp for pattern match
 * @returns Array of matching spans
 */
export function findAllSpansByName<T extends { name: string }>(
  spans: T[],
  namePattern: string | RegExp
): T[] {
  return spans.filter(s =>
    typeof namePattern === "string"
      ? s.name === namePattern
      : namePattern.test(s.name)
  );
}

/**
 * Assert that a span has a specific attribute value.
 * Provides clearer error messages than raw expect.
 *
 * @param span - The span to check
 * @param key - Attribute key
 * @param value - Expected value
 */
export function expectSpanToHaveAttribute(
  span: { attributes: Record<string, unknown> } | undefined,
  key: string,
  value: unknown
): void {
  if (!span) {
    throw new Error(`Expected span to exist when checking attribute "${key}"`);
  }
  if (span.attributes[key] !== value) {
    throw new Error(
      `Expected span attribute "${key}" to be ${JSON.stringify(value)}, but got ${JSON.stringify(span.attributes[key])}`
    );
  }
}

/**
 * Assert that a span has a specific status code.
 *
 * @param span - The span to check
 * @param expectedCode - Expected status code (1 = OK, 2 = ERROR)
 */
export function expectSpanStatus(
  span: { status?: { code: number } } | undefined,
  expectedCode: 1 | 2
): void {
  if (!span) {
    throw new Error("Expected span to exist when checking status");
  }
  if (span.status?.code !== expectedCode) {
    const statusName = expectedCode === 1 ? "OK" : "ERROR";
    throw new Error(
      `Expected span status to be ${statusName} (${expectedCode}), but got ${span.status?.code}`
    );
  }
}

/**
 * Fixed timestamp for deterministic testing.
 * Use with vi.spyOn(Date, 'now').mockReturnValue(FIXED_TIMESTAMP)
 */
export const FIXED_TIMESTAMP = 1704067200000; // 2024-01-01T00:00:00.000Z
