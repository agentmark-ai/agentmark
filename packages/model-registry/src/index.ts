import * as fs from "fs";
import * as path from "path";
import { modelsFileSchema, overridesFileSchema } from "./validation.js";
import { ModelRegistryImpl } from "./registry.js";
import type { ModelRegistry } from "./types.js";

export type {
  ModelMode,
  ModelPricing,
  ModelContext,
  ModelCapabilities,
  ModelEntry,
  ProviderInfo,
  ModelsFile,
  OverridesFile,
  ModelRegistry,
  SyncResult,
  SyncChangelog,
} from "./types.js";

export { modelsFileSchema, overridesFileSchema } from "./validation.js";
export { ModelRegistryImpl } from "./registry.js";

let cachedRegistry: ModelRegistry | null = null;

/**
 * Factory function that reads models.json + overrides.json from disk,
 * validates via Zod, constructs ModelRegistryImpl, and returns it.
 * Singleton pattern: caches the registry after first load.
 */
export function getModelRegistry(): ModelRegistry {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const packageRoot = path.resolve(__dirname, "..");
  const modelsPath = path.resolve(packageRoot, "models.json");
  const overridesPath = path.resolve(packageRoot, "overrides.json");

  const modelsRaw = JSON.parse(fs.readFileSync(modelsPath, "utf-8"));
  const modelsFile = modelsFileSchema.parse(modelsRaw);

  let overridesFile = undefined;
  if (fs.existsSync(overridesPath)) {
    const overridesRaw = JSON.parse(fs.readFileSync(overridesPath, "utf-8"));
    overridesFile = overridesFileSchema.parse(overridesRaw);
  }

  const labelsPath = path.resolve(packageRoot, "provider-labels.json");
  const providerLabels: Record<string, string> = fs.existsSync(labelsPath)
    ? JSON.parse(fs.readFileSync(labelsPath, "utf-8"))
    : {};

  cachedRegistry = new ModelRegistryImpl(modelsFile, overridesFile, providerLabels);
  return cachedRegistry;
}

/**
 * Reset the cached registry (useful for testing).
 */
export function resetRegistryCache(): void {
  cachedRegistry = null;
}
