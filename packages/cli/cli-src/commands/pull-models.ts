import path from "path";
import { getProviders } from "../utils/providers";
import * as fs from "fs-extra";
import prompts from "prompts";
import { loadAgentmarkConfig } from "../utils/project";

export interface PullModelsOptions {
  /**
   * Skip the interactive provider picker. Must match a provider key
   * registered in `getProviders()`.
   */
  provider?: string;
  /**
   * Skip the interactive multi-select. Comma-separated list of model
   * IDs to add (e.g. `gpt-4o,gpt-4o-mini`). When both `--provider` and
   * `--models` are passed, the command runs fully non-interactively
   * and is safe for CI.
   */
  models?: string;
}

const pullModels = async (options: PullModelsOptions = {}) => {
  const agentmarkConfig = loadAgentmarkConfig();

  const providers = await getProviders();

  let provider: string;
  if (options.provider) {
    if (!(options.provider in providers)) {
      throw new Error(
        `Unknown provider "${options.provider}". Available: ${Object.keys(providers).join(", ")}`,
      );
    }
    provider = options.provider;
  } else {
    const picked = await prompts({
      name: "provider",
      type: "select",
      message: "Select a provider",
      choices: Object.entries(providers).map(([key, provider]) => {
        return {
          title: provider.label,
          value: key,
        };
      }),
    });
    provider = picked.provider;
  }

  const providerData = providers[provider as keyof typeof providers];

  const allModels = [
    ...providerData.languageModels.map(
      (model) => ({
        title: `${model} (Language Model)`,
        value: model,
      })
    ),
    ...providerData.imageModels.map(
      (model) => ({
        title: `${model} (Image Generation)`,
        value: model,
      })
    ),
    ...providerData.speechModels.map(
      (model) => ({
        title: `${model} (Text to Speech)`,
        value: model,
      })
    ),
  ];

  const modelChoices = allModels.filter(
    (m) => !agentmarkConfig?.["builtInModels"]?.includes(m.value)
  );

  if (!modelChoices.length) {
    console.log("All models already added.");
    return;
  }

  let models: string[];
  if (options.models) {
    const requested = options.models
      .split(",")
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
    const knownValues = new Set(modelChoices.map((m) => m.value));
    const unknown = requested.filter((m) => !knownValues.has(m));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown or already-added models for provider "${provider}": ${unknown.join(", ")}`,
      );
    }
    if (requested.length === 0) {
      throw new Error("--models was empty after parsing. Pass a comma-separated list.");
    }
    models = requested;
  } else {
    const picked = await prompts({
      name: "models",
      type: "multiselect",
      message: "Select models",
      choices: modelChoices,
      min: 1,
    });
    models = picked.models as string[];
  }

  // Detect providers that need registration
  const selectedProviders = new Set<string>();
  for (const model of models as string[]) {
    if (model.includes("/")) {
      selectedProviders.add(model.split("/")[0]);
    }
  }

  if (selectedProviders.size > 0) {
    const providerList = Array.from(selectedProviders);

    // The hint assumes `@ai-sdk/*` providers — correct for the Vercel AI SDK
    // adapters (the default) AND Mastra (whose model registry consumes the
    // same providers). This used to branch on an `agentmark.json#adapter`
    // field, but nothing else in the ecosystem reads or writes that field
    // and the schema (additionalProperties: false) rejected it anyway —
    // adapter selection lives in the IDE-skill integration flow, not here.
    console.log("\n📦 Provider setup reminder:");
    console.log(
      "Make sure these providers are registered in your model registry:\n"
    );

    for (const provider of providerList) {
      console.log(`  import { ${provider} } from "@ai-sdk/${provider}";`);
    }

    const providerObj = providerList.map((p) => p).join(", ");
    console.log(`\n  .registerProviders({ ${providerObj} })\n`);
  }

  agentmarkConfig["builtInModels"] = [
    ...new Set([...models, ...(agentmarkConfig.builtInModels || [])]),
  ];

  await fs.writeJSON(
    path.join(process.cwd(), "agentmark.json"),
    agentmarkConfig,
    {
      spaces: 2,
    }
  );

  console.log(`Added ${models.length} model(s): ${models.join(", ")}`);
};

export default pullModels;
