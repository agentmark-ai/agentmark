/**
 * Remote model registry fetching.
 *
 * Fetches models.json from a CDN (jsdelivr) so consumers get fresh data
 * without waiting for an npm release. Falls back to the bundled copy on
 * network failure.
 */

import { modelsFileSchema, overridesFileSchema } from "./validation.js";
import { ModelRegistryImpl } from "./registry.js";
import type { ModelRegistry, ModelsFile, OverridesFile } from "./types.js";

// Raw GitHub is always up-to-date (no CDN cache lag). jsdelivr is a fallback:
// it mirrors GitHub with ~24h edge cache but has higher availability.
const RAW_BASE =
  "https://raw.githubusercontent.com/agentmark-ai/agentmark/main/packages/model-registry";
const CDN_BASE =
  "https://cdn.jsdelivr.net/gh/agentmark-ai/agentmark@main/packages/model-registry";

const MODELS_URL = `${RAW_BASE}/models.json`;
const OVERRIDES_URL = `${RAW_BASE}/overrides.json`;
const PROVIDER_LABELS_URL = `${RAW_BASE}/provider-labels.json`;
const MODELS_URL_FALLBACK = `${CDN_BASE}/models.json`;
const OVERRIDES_URL_FALLBACK = `${CDN_BASE}/overrides.json`;
const PROVIDER_LABELS_URL_FALLBACK = `${CDN_BASE}/provider-labels.json`;

/** How long to wait for the CDN before falling back to bundled data. */
const FETCH_TIMEOUT_MS = 5_000;

/** Cache TTL — avoid re-fetching within the same long-running process. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cachedRemoteRegistry: ModelRegistry | null = null;
let cachedAt = 0;

function isStale(): boolean {
  return Date.now() - cachedAt > CACHE_TTL_MS;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.json() as Promise<T>;
}

async function fetchJsonWithFallback<T>(primary: string, fallback: string): Promise<T> {
  try {
    return await fetchJson<T>(primary);
  } catch {
    return fetchJson<T>(fallback);
  }
}

/**
 * Fetch the model registry, trying raw GitHub first (no cache lag) then
 * falling back to the jsdelivr CDN mirror (~24h edge cache).
 * Returns null on any failure (network, parse, timeout).
 */
async function fetchRemoteRegistry(): Promise<ModelRegistry | null> {
  try {
    const [modelsRaw, overridesRaw, labelsRaw] = await Promise.all([
      fetchJsonWithFallback<unknown>(MODELS_URL, MODELS_URL_FALLBACK),
      fetchJsonWithFallback<unknown>(OVERRIDES_URL, OVERRIDES_URL_FALLBACK).catch(() => null),
      fetchJsonWithFallback<Record<string, string>>(PROVIDER_LABELS_URL, PROVIDER_LABELS_URL_FALLBACK).catch(() => ({})),
    ]);

    const modelsFile: ModelsFile = modelsFileSchema.parse(modelsRaw);
    const overridesFile: OverridesFile | undefined = overridesRaw
      ? overridesFileSchema.parse(overridesRaw)
      : undefined;

    return new ModelRegistryImpl(
      modelsFile,
      overridesFile,
      labelsRaw as Record<string, string>
    );
  } catch {
    return null;
  }
}

/**
 * Get the model registry, fetching fresh data from the CDN.
 * Falls back to the provided local registry on network failure.
 *
 * @param localFallback - A sync function that returns the bundled registry.
 *   Only called when the CDN is unreachable.
 */
export async function getModelRegistryAsync(
  localFallback: () => ModelRegistry
): Promise<ModelRegistry> {
  if (cachedRemoteRegistry && !isStale()) {
    return cachedRemoteRegistry;
  }

  const remote = await fetchRemoteRegistry();
  if (remote) {
    cachedRemoteRegistry = remote;
    cachedAt = Date.now();
    return remote;
  }

  return localFallback();
}

/**
 * Reset the remote cache (useful for testing).
 */
export function resetRemoteCache(): void {
  cachedRemoteRegistry = null;
  cachedAt = 0;
}
