import type { DataSource } from './types.js';
import { HttpDataSource } from './http-data-source.js';
import { getConfig } from '../config.js';

export function createDataSource(): DataSource {
  const config = getConfig();
  return new HttpDataSource(config.url, config.timeoutMs, config.apiKey);
}

export { HttpDataSource } from './http-data-source.js';
export type { DataSource } from './types.js';
export * from './types.js';
