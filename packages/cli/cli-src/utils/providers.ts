import { getModelRegistryAsync } from "@agentmark-ai/model-registry";

type ProvidersMap = Record<
  string,
  {
    label: string;
    languageModels: string[];
    imageModels: string[];
    speechModels: string[];
  }
>;

let cachedProviders: ProvidersMap | null = null;

export async function getProviders(): Promise<ProvidersMap> {
  if (cachedProviders) return cachedProviders;

  const registry = await getModelRegistryAsync();
  const allModels = registry.getAllModels();
  const providers = registry.getProviders();

  const labelMap: Record<string, string> = {};
  for (const p of providers) {
    labelMap[p.id] = p.label;
  }

  const result: ProvidersMap = {};

  for (const entry of allModels) {
    if (!result[entry.provider]) {
      result[entry.provider] = {
        label: labelMap[entry.provider] ?? entry.provider,
        languageModels: [],
        imageModels: [],
        speechModels: [],
      };
    }

    const group = result[entry.provider]!;
    const prefixedId = `${entry.provider}/${entry.id}`;

    switch (entry.mode) {
      case "chat":
        group.languageModels.push(prefixedId);
        break;
      case "image_generation":
        group.imageModels.push(prefixedId);
        break;
      case "audio_speech":
        group.speechModels.push(prefixedId);
        break;
    }
  }

  cachedProviders = result;
  return result;
}
