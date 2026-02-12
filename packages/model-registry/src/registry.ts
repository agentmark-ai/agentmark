import type {
  ModelCapabilities,
  ModelEntry,
  ModelPricing,
  ModelRegistry,
  ModelsFile,
  OverridesFile,
  ProviderInfo,
} from "./types.js";
import {
  getPricingDictionary,
  getProviderModels,
} from "./compat.js";

export class ModelRegistryImpl implements ModelRegistry {
  private models: Map<string, ModelEntry>;
  private providerLabels: Record<string, string>;

  constructor(
    modelsFile: ModelsFile,
    overridesFile?: OverridesFile,
    providerLabels: Record<string, string> = {}
  ) {
    this.providerLabels = providerLabels;
    this.models = new Map();

    // Load base models
    for (const [id, entry] of Object.entries(modelsFile.models)) {
      this.models.set(id, { id, ...entry });
    }

    // Apply overrides (shallow merge per model)
    if (overridesFile) {
      for (const [id, overrideFields] of Object.entries(
        overridesFile.models
      )) {
        const existing = this.models.get(id);
        if (existing) {
          this.models.set(id, { ...existing, ...overrideFields, id });
        } else {
          // Override adds a new model — requires provider, displayName, mode at minimum
          if (
            overrideFields.provider &&
            overrideFields.displayName &&
            overrideFields.mode
          ) {
            this.models.set(id, {
              id,
              provider: overrideFields.provider,
              displayName: overrideFields.displayName,
              mode: overrideFields.mode,
              ...overrideFields,
            });
          }
        }
      }
    }
  }

  getProviders(): ProviderInfo[] {
    const providerCounts = new Map<string, number>();
    for (const entry of this.models.values()) {
      providerCounts.set(
        entry.provider,
        (providerCounts.get(entry.provider) ?? 0) + 1
      );
    }

    return Array.from(providerCounts.entries()).map(([id, count]) => ({
      id,
      label: this.providerLabels[id] ?? id,
      modelCount: count,
    }));
  }

  getModelsByProvider(provider: string): ModelEntry[] {
    const result: ModelEntry[] = [];
    for (const entry of this.models.values()) {
      if (entry.provider === provider) {
        result.push(entry);
      }
    }
    return result;
  }

  getAllModels(): ModelEntry[] {
    return Array.from(this.models.values());
  }

  getModel(modelId: string): ModelEntry | undefined {
    return this.models.get(modelId);
  }

  getPricingForModel(modelId: string): ModelPricing | undefined {
    return this.models.get(modelId)?.pricing;
  }

  getCapabilitiesForModel(modelId: string): ModelCapabilities | undefined {
    return this.models.get(modelId)?.capabilities;
  }

  findModelsByCapability(capability: keyof ModelCapabilities): ModelEntry[] {
    const result: ModelEntry[] = [];
    for (const entry of this.models.values()) {
      if (entry.capabilities?.[capability] === true) {
        result.push(entry);
      }
    }
    return result;
  }

  findDeprecatedModels(): ModelEntry[] {
    const result: ModelEntry[] = [];
    for (const entry of this.models.values()) {
      if (entry.deprecationDate) {
        result.push(entry);
      }
    }
    return result;
  }

  getPricingDictionary(): Record<
    string,
    { promptPrice: number; completionPrice: number }
  > {
    return getPricingDictionary(this.models);
  }

  getProviderModels(): Record<
    string,
    {
      label: string;
      languageModels: string[];
      imageModels: string[];
      speechModels: string[];
    }
  > {
    return getProviderModels(this.models, this.providerLabels);
  }
}
