import path from "path";
import { Providers } from "../utils/providers";
import * as fs from "fs-extra";
import prompts from "prompts";
import generateSchema from "./generate-schema";

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

  // Detect providers that need registration
  const selectedProviders = new Set<string>();
  for (const model of models as string[]) {
    if (model.includes("/")) {
      selectedProviders.add(model.split("/")[0]);
    }
  }

  if (selectedProviders.size > 0) {
    const adapterType = agentmarkConfig?.adapter || "ai-sdk";
    const providerList = Array.from(selectedProviders);

    console.log("\n📦 Provider setup reminder:");
    console.log(
      "Make sure these providers are registered in your model registry:\n"
    );

    for (const provider of providerList) {
      if (
        adapterType === "ai-sdk" ||
        adapterType === "ai-sdk-v5" ||
        adapterType === "ai-sdk-v4"
      ) {
        console.log(
          `  import { ${provider} } from "@ai-sdk/${provider}";`
        );
      } else if (adapterType === "mastra") {
        console.log(`  // Register ${provider} provider for Mastra`);
      } else if (adapterType === "claude-agent-sdk") {
        console.log(
          `  // Claude Agent SDK handles models natively — no registration needed`
        );
      }
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

  console.log("Models pulled successfully.");

  // Regenerate prompt schema so IDE squiggles stay in sync with new models
  try {
    await generateSchema({});
  } catch {
    // Best-effort — don't fail pull-models if schema generation has issues
  }
};

export default pullModels;
