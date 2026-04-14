import { describe, it, expect } from 'vitest';
import { formatOutput } from '../formatters';

describe('formatOutput', () => {
  const sampleData = {
    data: [
      { id: '1', name: 'trace-1', status: 'ok', latency_ms: 100 },
      { id: '2', name: 'trace-2', status: 'error', latency_ms: 250 },
    ],
    pagination: { page: 1, limit: 50, total: 2, hasMore: false },
  };

  it('should output JSON format', () => {
    const result = formatOutput(sampleData, 'json');
    expect(JSON.parse(result)).toEqual(sampleData);
  });

  it('should output table format', () => {
    const result = formatOutput(sampleData, 'table');
    expect(result).toContain('id');
    expect(result).toContain('name');
    expect(result).toContain('trace-1');
    expect(result).toContain('trace-2');
    expect(result).toContain('---');
  });

  it('should output CSV format', () => {
    const result = formatOutput(sampleData, 'csv');
    const lines = result.split('\n');
    expect(lines[0]).toBe('id,name,status,latency_ms');
    expect(lines[1]).toBe('1,trace-1,ok,100');
    expect(lines[2]).toBe('2,trace-2,error,250');
  });

  it('should handle empty data', () => {
    expect(formatOutput({ data: [] }, 'table')).toBe('No results.');
    expect(formatOutput({ data: [] }, 'csv')).toBe('');
  });

  it('should escape CSV values with commas', () => {
    const data = [{ name: 'hello, world', value: 'normal' }];
    const result = formatOutput(data, 'csv');
    expect(result).toContain('"hello, world"');
  });
});
