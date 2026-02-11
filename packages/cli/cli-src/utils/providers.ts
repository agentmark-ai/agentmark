import * as fs from "fs";
import * as path from "path";

// Load model registry JSON directly (avoids needing compiled TS from @repo/model-registry).
const registryDir = path.dirname(
  require.resolve("@repo/model-registry/package.json")
);
const modelsData = JSON.parse(
  fs.readFileSync(path.join(registryDir, "models.json"), "utf-8")
);
const overridesData = JSON.parse(
  fs.readFileSync(path.join(registryDir, "overrides.json"), "utf-8")
);

const PROVIDER_LABELS: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(registryDir, "provider-labels.json"), "utf-8")
);

const allModels: Record<string, { provider: string; mode: string }> = {
  ...modelsData.models,
  ...overridesData.models,
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
        label: PROVIDER_LABELS[entry.provider] ?? entry.provider,
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
