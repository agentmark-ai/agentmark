// Local /v1/pricing handler.
//
// Returns a map keyed by model ID (e.g. "gpt-4o") with per-1K-token
// prices: `{ promptPrice, completionPrice }`. The data comes from
// `@agentmark-ai/model-registry`, which ships bundled `models.json` and
// `overrides.json` files the CLI already depends on (see package.json).
// The bundled snapshot updates whenever the CLI is upgraded.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — model-registry ships its JSON assets but the package
// typings don't yet expose them.
import modelsFile from "@agentmark-ai/model-registry/models.json";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — see above.
import overridesFile from "@agentmark-ai/model-registry/overrides.json";
import {
  buildPricingDictionary,
  type PricingDictionary,
} from "@agentmark-ai/model-registry/pricing";

type ModelEntry = {
  pricing?: { inputCostPerToken: number; outputCostPerToken: number };
  [k: string]: unknown;
};

// Built once at module init — the bundled registry never changes at runtime.
const BUNDLED_MODELS: Record<string, ModelEntry> = {
  ...((modelsFile as { models?: Record<string, ModelEntry> }).models ?? {}),
  ...((overridesFile as { models?: Record<string, ModelEntry> }).models ?? {}),
};

export const LOCAL_PRICING_MAP: PricingDictionary =
  buildPricingDictionary(BUNDLED_MODELS);
