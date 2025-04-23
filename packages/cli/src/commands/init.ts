import * as fs from "fs-extra";
import prompts from "prompts";
import { Providers } from "../utils/providers";
import { createExampleApp } from "../utils/examples/create-example-app";

const init = async () => {
  const config: any = {
    "$schema": "https://docs.agentmark.co/agentmark.schema.json",
    version: "2.0.0",
    mdxVersion: "1.0",
    agentmarkPath: "/",
  };
  console.log("Initializing project.");

  const { shouldCreateExample } = await prompts({
    name: "shouldCreateExample",
    message: "Would you like to create an example app?",
    type: "confirm",
  });

  if (shouldCreateExample) {
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
    
    const { model } = await prompts({
      name: "model",
      type: "select",
      message: "Select a model",
      choices: modelChoices,
    });

    const { useCloud } = await prompts({
      name: "useCloud",
      message: "Are you planning to integrate with AgentMark Cloud or just use local development?",
      type: "select",
      choices: [
        { title: "AgentMark Cloud", value: "cloud" },
        { title: "Local Development", value: "local" }
      ]
    });

    if (useCloud === "cloud") {
      config.cloud = true;
    }

    createExampleApp(provider, model, useCloud);
  }

  fs.writeJsonSync("agentmark.json", config, { spaces: 2 });

  console.log(
    "🚀 Deploy to Production: https://docs.agentmark.ai/agentmark/getting_started/quickstart"
  );
};

export default init;
