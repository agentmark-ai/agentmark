import modelsData from "@agentmark-ai/model-registry/models.json";
import overridesData from "@agentmark-ai/model-registry/overrides.json";
import PROVIDER_LABELS from "@agentmark-ai/model-registry/provider-labels.json";

const allModels: Record<string, { provider: string; mode: string }> = {
  ...(modelsData as any).models,
  ...(overridesData as any).models,
};

function buildProviders(): Record<
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

  for (const [id, entry] of Object.entries(allModels)) {
    if (!result[entry.provider]) {
      result[entry.provider] = {
        label: (PROVIDER_LABELS as Record<string, string>)[entry.provider] ?? entry.provider,
        languageModels: [],
        imageModels: [],
        speechModels: [],
      };
    }

    const group = result[entry.provider]!;

    switch (entry.mode) {
      case "chat":
        group.languageModels.push(id);
        break;
      case "image_generation":
        group.imageModels.push(id);
        break;
      case "audio_speech":
        group.speechModels.push(id);
        break;
    }
  }

  return result;
}

export const Providers = buildProviders();
