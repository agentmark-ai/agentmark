import path from "path";
import { Providers } from "../utils/providers";
import * as fs from "fs-extra";
import prompts from "prompts";

const pullModels = async () => {
  let agentmarkConfig = null;

  try {
    agentmarkConfig = await fs.readJSON(
      path.join(process.cwd(), "agentmark.json")
    );
  } catch (_error) {
    throw new Error(
      "Agentmark project not found. Please initialize first using agentmark init."
    );
  }

  const { provider } = await prompts({
    name: "provider",
    type: "select",
    message: "Select a provider",
    choices: Object.entries(Providers).map(([key, provider]) => {
      return {
        title: provider.label,
        value: key,
      };
    }),
  });

  const allModels = [
    ...Providers[provider as keyof typeof Providers].languageModels.map(
      (model) => ({
        title: `${model} (Language Model)`,
        value: model,
      })
    ),
    ...Providers[provider as keyof typeof Providers].imageModels.map(
      (model) => ({
        title: `${model} (Image Generation)`,
        value: model,
      })
    ),
    ...Providers[provider as keyof typeof Providers].speechModels.map(
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

  const { models } = await prompts({
    name: "models",
    type: "multiselect",
    message: "Select models",
    choices: modelChoices,
  });

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

  console.log("Models pulled successfully.");
};

export default pullModels;
