/**
 * Format API response data for CLI output.
 */

export type OutputFormat = 'json' | 'table' | 'csv';

export function formatOutput(data: unknown, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'table':
      return formatTable(data);
    case 'csv':
      return formatCsv(data);
    default:
      return JSON.stringify(data, null, 2);
  }
}

function formatTable(data: unknown): string {
  if (!data || typeof data !== 'object') return String(data);

  // Handle paginated responses
  const items = Array.isArray(data)
    ? data
    : ((data as Record<string, unknown>).data as unknown[] ?? [data]);

  if (!Array.isArray(items) || items.length === 0) return 'No results.';

  const firstItem = items[0] as Record<string, unknown>;
  const columns = Object.keys(firstItem);

  // Calculate column widths
  const widths = columns.map((col) => {
    const values = items.map((item) =>
      String((item as Record<string, unknown>)[col] ?? ''),
    );
    return Math.max(col.length, ...values.map((v) => Math.min(v.length, 40)));
  });

  // Header
  const header = columns
    .map((col, i) => col.padEnd(widths[i]!))
    .join(' | ');
  const separator = widths.map((w) => '-'.repeat(w)).join('-+-');

  // Rows
  const rows = items.map((item) => {
    return columns
      .map((col, i) => {
        const val = String((item as Record<string, unknown>)[col] ?? '');
        return val.substring(0, 40).padEnd(widths[i]!);
      })
      .join(' | ');
  });

  return [header, separator, ...rows].join('\n');
}

function formatCsv(data: unknown): string {
  if (!data || typeof data !== 'object') return String(data);

  const items = Array.isArray(data)
    ? data
    : ((data as Record<string, unknown>).data as unknown[] ?? [data]);

  if (!Array.isArray(items) || items.length === 0) return '';

  const firstItem = items[0] as Record<string, unknown>;
  const columns = Object.keys(firstItem);

  const header = columns.join(',');
  const rows = items.map((item) => {
    return columns
      .map((col) => {
        const val = String((item as Record<string, unknown>)[col] ?? '');
        // Escape CSV values
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      })
      .join(',');
  });

  return [header, ...rows].join('\n');
}
