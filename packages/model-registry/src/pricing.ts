/**
 * Model-id → price resolution.
 *
 * This module is intentionally pure: no filesystem, network, or Node APIs.
 * It is published as the `@agentmark-ai/model-registry/pricing` entry point
 * so edge runtimes (Cloudflare Workers) and bundlers can consume it without
 * pulling in the fs-backed registry factory from the package root.
 *
 * Resolution layers (in order):
 *   1. Exact match on the reported model id.
 *   2. Normalized candidates — provider prefixes (`openai/`, `models/`),
 *      fine-tune ids (`ft:base:org::id`), Bedrock region prefixes
 *      (`us.anthropic.…`), and date/version suffixes (`-2024-08-06`,
 *      `@20240806`, `-latest`) stripped in combination.
 *   3. Case-insensitive match of each candidate.
 *   4. Longest boundary-prefix match (`gpt-4o-mini-2099-01-01` → `gpt-4o-mini`),
 *      so newly released dated variants price against their base model
 *      instead of $0 until the registry sync catches up.
 */

/** Prices per 1,000 tokens — the wire format served by `/v1/pricing`. */
export interface PricePerThousandTokens {
  promptPrice: number;
  completionPrice: number;
}

export type PricingDictionary = Record<string, PricePerThousandTokens>;

interface PricedModelEntry {
  pricing?: {
    inputCostPerToken: number;
    outputCostPerToken: number;
  };
}

/**
 * Convert a registry `models` record (per-token prices) into the flat
 * per-1K-token dictionary used by the gateway and CLI pricing endpoints.
 * Models without a pricing block are dropped.
 */
export function buildPricingDictionary(
  models: Record<string, PricedModelEntry>
): PricingDictionary {
  const result: PricingDictionary = {};
  for (const [id, entry] of Object.entries(models)) {
    if (entry.pricing) {
      result[id] = {
        promptPrice: entry.pricing.inputCostPerToken * 1000,
        completionPrice: entry.pricing.outputCostPerToken * 1000,
      };
    }
  }
  return result;
}

/** Cost in USD for a generation, given per-1K-token prices. */
export function costForTokens(
  price: PricePerThousandTokens,
  inputTokens: number,
  outputTokens: number
): number {
  return (
    (price.promptPrice * inputTokens + price.completionPrice * outputTokens) /
    1000
  );
}

// Bedrock cross-region inference profiles prefix the model id with a region.
const REGION_PREFIX = /^(?:us|eu|ap|apac|jp|au|ca|sa|us-gov|global)\./;

// Version-pin suffixes providers append to otherwise-stable model names.
const VERSION_SUFFIXES = [
  /-\d{4}-\d{2}-\d{2}$/, // gpt-4o-2024-08-06
  /-\d{8}$/, // claude-3-5-sonnet-20241022
  /@\d{8}$/, // claude-3-5-sonnet-v2@20241022 (Vertex)
  /@\d{3}$/, // gemini-1.5-pro@001 (Vertex)
  /-latest$/, // grok-2-latest
];

const FINE_TUNE_ID = /^ft:([^:]+)/;

/**
 * Ordered, deduplicated list of lookup candidates for a reported model id.
 * The raw (trimmed) id always comes first; increasingly aggressive
 * normalizations follow, breadth-first, so combinations compose
 * (`openai/gpt-4o-2024-08-06` → `gpt-4o-2024-08-06` → `gpt-4o`).
 */
export function candidateModelIds(modelId: string): string[] {
  const seen = new Set<string>();
  const queue: string[] = [];
  const enqueue = (id: string) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      queue.push(id);
    }
  };

  enqueue(modelId.trim());

  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];

    // ft:gpt-4o-2024-08-06:acme::abc123 → ft:gpt-4o-2024-08-06, gpt-4o-2024-08-06
    const ft = FINE_TUNE_ID.exec(id);
    if (ft) {
      enqueue(`ft:${ft[1]}`);
      enqueue(ft[1]);
    }

    // openai/gpt-4o, models/gemini-2.5-pro, accounts/fireworks/models/llama-v3
    const lastSlash = id.lastIndexOf("/");
    if (lastSlash !== -1) enqueue(id.slice(lastSlash + 1));

    // us.anthropic.claude-… → anthropic.claude-…
    const regionStripped = id.replace(REGION_PREFIX, "");
    if (regionStripped !== id) enqueue(regionStripped);

    for (const suffix of VERSION_SUFFIXES) {
      const stripped = id.replace(suffix, "");
      if (stripped !== id) enqueue(stripped);
    }
  }

  return queue;
}

const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

// Prefix fallback guards: the matched key must be a real model family name
// (not a 1–3 char fragment) and the boundary after it must be a separator.
const MIN_PREFIX_KEY_LENGTH = 4;
const PREFIX_BOUNDARY_CHARS = new Set(["-", ":", "@", ".", "/", "_"]);
const RESOLUTION_CACHE_LIMIT = 5000;

interface MapIndex {
  /** lowercase key → original key */
  lowercase: Map<string, string>;
  /** keys eligible for prefix fallback, longest first */
  prefixKeys: string[];
  /** memoized resolutions for ids that missed the exact lookup */
  resolved: Map<string, string | undefined>;
}

// Index per price-map object. WeakMap so swapped-in refreshed maps
// (e.g. after a CDN refresh) get fresh indexes and old ones are GC'd.
const indexCache = new WeakMap<object, MapIndex>();

function getIndex(priceMap: Record<string, unknown>): MapIndex {
  let index = indexCache.get(priceMap);
  if (!index) {
    const keys = Object.keys(priceMap);
    index = {
      lowercase: new Map(keys.map((k) => [k.toLowerCase(), k])),
      prefixKeys: keys
        .filter((k) => k.length >= MIN_PREFIX_KEY_LENGTH)
        .sort((a, b) => b.length - a.length),
      resolved: new Map(),
    };
    indexCache.set(priceMap, index);
  }
  return index;
}

/**
 * Resolve the registry key a reported model id should price against,
 * or undefined when nothing plausibly matches.
 */
export function resolveModelKey(
  modelId: string,
  priceMap: Record<string, unknown>
): string | undefined {
  if (!modelId) return undefined;
  if (hasOwn(priceMap, modelId)) return modelId;

  const index = getIndex(priceMap);
  if (index.resolved.has(modelId)) return index.resolved.get(modelId);

  const candidates = candidateModelIds(modelId);
  let match: string | undefined;

  for (const candidate of candidates) {
    if (hasOwn(priceMap, candidate)) {
      match = candidate;
      break;
    }
    const caseInsensitive = index.lowercase.get(candidate.toLowerCase());
    if (caseInsensitive !== undefined) {
      match = caseInsensitive;
      break;
    }
  }

  if (match === undefined) {
    // Longest boundary-prefix fallback: candidate must extend the key at a
    // separator (gpt-4o-mini-2099-01-01 → gpt-4o-mini, never gpt-4o-min).
    outer: for (const candidate of candidates) {
      for (const key of index.prefixKeys) {
        if (
          candidate.length > key.length &&
          candidate.startsWith(key) &&
          PREFIX_BOUNDARY_CHARS.has(candidate[key.length])
        ) {
          match = key;
          break outer;
        }
      }
    }
  }

  if (index.resolved.size < RESOLUTION_CACHE_LIMIT) {
    index.resolved.set(modelId, match);
  }
  return match;
}

/**
 * Look up the price entry for a reported model id using layered matching.
 * Works against any string-keyed map (registry pricing dictionaries and
 * user-defined cost maps alike), so user overrides resolve with the same
 * normalization rules as built-in pricing.
 */
export function resolveModelPrice<T>(
  modelId: string,
  priceMap: Record<string, T>
): T | undefined {
  const key = resolveModelKey(modelId, priceMap);
  return key === undefined ? undefined : priceMap[key];
}
