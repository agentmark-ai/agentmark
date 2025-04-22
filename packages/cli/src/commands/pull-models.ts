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
  } catch (error) {
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

  const modelChoices = Providers[provider as keyof typeof Providers].models
    .map((model) => {
      return {
        title: model,
        value: model,
      };
    })
    .filter((m) => !agentmarkConfig?.["builtInModels"]?.includes(m.value));

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

  await fs.writeJSON(path.join(process.cwd(), "agentmark.json"), agentmarkConfig, {
    spaces: 2,
  });

  console.log("Models pulled successfully.");
};

export default pullModels;
