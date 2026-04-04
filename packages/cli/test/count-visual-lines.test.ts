import { describe, it, expect } from 'vitest';
import { countVisualLines } from '../cli-src/commands/run-prompt';

describe('countVisualLines', () => {
  it('counts single short line as 1', () => {
    expect(countVisualLines('hello', 80)).toBe(1);
  });

  it('counts multiple short lines', () => {
    expect(countVisualLines('{\n  "a": 1\n}', 80)).toBe(3);
  });

  it('counts a line that wraps once as 2', () => {
    // 100 chars at 80 columns = 2 visual lines
    const long = 'x'.repeat(100);
    expect(countVisualLines(long, 80)).toBe(2);
  });

  it('counts a line that wraps twice as 3', () => {
    // 200 chars at 80 columns = 3 visual lines
    const long = 'x'.repeat(200);
    expect(countVisualLines(long, 80)).toBe(3);
  });

  it('counts empty line as 1', () => {
    expect(countVisualLines('', 80)).toBe(1);
  });

  it('handles mixed short and long lines', () => {
    const text = [
      '{',                    // 1 visual line
      '  "name": "short",',   // 1 visual line
      '  "reasoning": "' + 'a'.repeat(200) + '"', // ~3 visual lines at 80 cols
      '}',                    // 1 visual line
    ].join('\n');
    const result = countVisualLines(text, 80);
    expect(result).toBe(6); // 1 + 1 + 3 + 1
  });

  it('handles narrow terminal', () => {
    expect(countVisualLines('hello world', 5)).toBe(3); // 12 chars / 5 cols = 3
  });

  it('handles typical classifier JSON output', () => {
    const json = JSON.stringify({
      published_sale: false,
      sale_date: "March 2026",
      sale_end_date: null,
      reasoning: "This is a long reasoning string that explains why the auction is not published. ".repeat(3),
    }, null, 2);
    const lines = countVisualLines(json, 80);
    // Should be more than the 6 JSON lines due to reasoning wrapping
    expect(lines).toBeGreaterThan(6);
  });
});
