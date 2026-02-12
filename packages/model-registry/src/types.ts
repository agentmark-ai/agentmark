/**
 * Model Registry Types
 *
 * Defines the public interface for the @agentmark-ai/model-registry package.
 * All consumers (CLI, dashboard, analytics, adapters) import from this contract.
 */

// ─── Core Types ─────────────────────────────────────────────────

export type ModelMode =
  | "chat"
  | "embedding"
  | "image_generation"
  | "audio_speech"
  | "audio_transcription"
  | "moderation"
  | "rerank";

export interface ModelPricing {
  inputCostPerToken: number;
  outputCostPerToken: number;
  cacheCreationCostPerToken?: number;
  cacheReadCostPerToken?: number;
}

export interface ModelContext {
  maxInputTokens?: number;
  maxOutputTokens?: number;
}

export interface ModelCapabilities {
  vision?: boolean;
  functionCalling?: boolean;
  parallelFunctionCalling?: boolean;
  structuredOutput?: boolean;
  promptCaching?: boolean;
  reasoning?: boolean;
  audioInput?: boolean;
  audioOutput?: boolean;
  pdfInput?: boolean;
  webSearch?: boolean;
}

export interface ModelEntry {
  id: string;
  provider: string;
  displayName: string;
  mode: ModelMode;
  pricing?: ModelPricing;
  context?: ModelContext;
  capabilities?: ModelCapabilities;
  deprecationDate?: string | null;
  source?: string;
  supportedParameters?: string[];
}

export interface ProviderInfo {
  id: string;
  label: string;
  modelCount: number;
}

// ─── Generated File Schema ──────────────────────────────────────

export interface ModelsFile {
  $schema?: string;
  version: string;
  generatedAt: string;
  sources: Record<
    string,
    {
      fetchedAt: string;
      modelCount: number;
    }
  >;
  models: Record<string, Omit<ModelEntry, "id">>;
}

export interface OverridesFile {
  $schema?: string;
  models: Record<string, Partial<Omit<ModelEntry, "id">>>;
}

// ─── Registry Interface ─────────────────────────────────────────

export interface ModelRegistry {
  getProviders(): ProviderInfo[];
  getModelsByProvider(provider: string): ModelEntry[];
  getAllModels(): ModelEntry[];
  getModel(modelId: string): ModelEntry | undefined;
  getPricingForModel(modelId: string): ModelPricing | undefined;
  getCapabilitiesForModel(modelId: string): ModelCapabilities | undefined;
  findModelsByCapability(capability: keyof ModelCapabilities): ModelEntry[];
  findDeprecatedModels(): ModelEntry[];
  getPricingDictionary(): Record<
    string,
    { promptPrice: number; completionPrice: number }
  >;
  getProviderModels(): Record<
    string,
    {
      label: string;
      languageModels: string[];
      imageModels: string[];
      speechModels: string[];
    }
  >;
}

// ─── Sync Script Types ──────────────────────────────────────────

export interface SyncResult {
  models: Record<string, Omit<ModelEntry, "id">>;
  sources: ModelsFile["sources"];
  changelog: SyncChangelog;
}

export interface SyncChangelog {
  added: string[];
  removed: string[];
  pricingChanged: Array<{
    modelId: string;
    field: string;
    oldValue: number;
    newValue: number;
  }>;
  capabilitiesChanged: Array<{
    modelId: string;
    field: string;
    oldValue: boolean | undefined;
    newValue: boolean | undefined;
  }>;
  anomalies: Array<{
    modelId: string;
    type: string;
    description: string;
  }>;
}
