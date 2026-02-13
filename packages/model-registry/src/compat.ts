import type { ModelEntry } from "./types.js";

/**
 * Returns pricing in the legacy format used by llm-costs and analytics.
 * Prices are per 1K tokens (inputCostPerToken * 1000).
 */
export function getPricingDictionary(
  models: Map<string, ModelEntry>
): Record<string, { promptPrice: number; completionPrice: number }> {
  const result: Record<
    string,
    { promptPrice: number; completionPrice: number }
  > = {};

  for (const [id, entry] of models) {
    if (entry.pricing) {
      result[id] = {
        promptPrice: entry.pricing.inputCostPerToken * 1000,
        completionPrice: entry.pricing.outputCostPerToken * 1000,
      };
    }
  }

  return result;
}

/**
 * Returns provider+model groupings matching the CLI's Providers structure.
 * Used by pull-models command for backward compatibility.
 */
export function getProviderModels(
  models: Map<string, ModelEntry>,
  providerLabels: Record<string, string>
): Record<
  string,
  {
    label: string;
    languageModels: string[];
    imageModels: string[];
    speechModels: string[];
  }
> {
  const result: Record<
    string,
    {
      label: string;
      languageModels: string[];
      imageModels: string[];
      speechModels: string[];
    }
  > = {};

  for (const [id, entry] of models) {
    if (!result[entry.provider]) {
      result[entry.provider] = {
        label: providerLabels[entry.provider] ?? entry.provider,
        languageModels: [],
        imageModels: [],
        speechModels: [],
      };
    }

    const group = result[entry.provider]!;

    switch (entry.mode) {
      case "chat":
      case "embedding":
      case "moderation":
      case "rerank":
        group.languageModels.push(id);
        break;
      case "image_generation":
        group.imageModels.push(id);
        break;
      case "audio_speech":
        group.speechModels.push(id);
        break;
      case "audio_transcription":
        group.languageModels.push(id);
        break;
    }
  }

  return result;
}
