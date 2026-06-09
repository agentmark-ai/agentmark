/**
 * Shared model-catalog helpers, reused by `generate-schema` (builds the
 * frontmatter enum) and `doctor` (validates `builtInModels`). Both read the
 * same bundled model registry so a model `generate-schema` would put in the
 * enum is exactly one `doctor` treats as known.
 */

import { getModelRegistryAsync } from "@agentmark-ai/model-registry";

export interface RegistryModel {
  provider: string;
  mode: string;
}

/** `modelId` (without the `provider/` prefix) → its registry entry. */
export async function getRegistryModelMap(): Promise<Record<string, RegistryModel>> {
  const registry = await getModelRegistryAsync();
  return Object.fromEntries(
    registry.getAllModels().map((m) => [m.id, { provider: m.provider, mode: m.mode }]),
  );
}

export interface ClassifiedModels {
  languageModels: string[];
  imageModels: string[];
  speechModels: string[];
  /** `provider/model` ids not present in the registry (typo, or a very new model). */
  unknownModels: string[];
}

/**
 * Split `provider/model` ids into language / image / speech / unknown buckets
 * using the registry's `mode`. (Moved verbatim from `generate-schema.ts`.)
 */
export function classifyModels(
  allRegistryModels: Record<string, RegistryModel>,
  builtInModels: string[],
): ClassifiedModels {
  const languageModels: string[] = [];
  const imageModels: string[] = [];
  const speechModels: string[] = [];
  const unknownModels: string[] = [];

  for (const prefixedId of builtInModels) {
    const slashIndex = prefixedId.indexOf("/");
    if (slashIndex === -1) {
      unknownModels.push(prefixedId);
      continue;
    }
    const modelId = prefixedId.slice(slashIndex + 1);
    const entry = allRegistryModels[modelId];

    if (!entry) {
      unknownModels.push(prefixedId);
      continue;
    }

    switch (entry.mode) {
      case "chat":
        languageModels.push(prefixedId);
        break;
      case "image_generation":
        imageModels.push(prefixedId);
        break;
      case "audio_speech":
        speechModels.push(prefixedId);
        break;
      default:
        unknownModels.push(prefixedId);
    }
  }

  return { languageModels, imageModels, speechModels, unknownModels };
}
