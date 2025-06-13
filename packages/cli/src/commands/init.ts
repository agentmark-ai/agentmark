import * as fs from "fs-extra";
import prompts from "prompts";
import { Providers } from "../utils/providers";
import { createExampleApp } from "../utils/examples/create-example-app";

const init = async () => {
  const config: any = {
    $schema:
      "https://raw.githubusercontent.com/agentmark-ai/agentmark/refs/heads/main/packages/cli/agentmark.schema.json",
    version: "2.0.0",
    mdxVersion: "1.0",
    agentmarkPath: "/",
  };
  console.log("Initializing project.");

  const { provider } = await prompts({
    name: "provider",
    type: "select",
    message: "Select a model provider you want to start with",
    choices: Object.entries(Providers).map(([key, provider]) => {
      return {
        title: provider.label,
        value: key,
      };
    }),
  });

  const models = [
    ...Providers[provider as keyof typeof Providers].languageModels.map((model) => ({
      title: `${model} (Language Model)`,
      value: model,
    })),
    ...Providers[provider as keyof typeof Providers].imageModels.map((model) => ({
      title: `${model} (Image Generation)`,
      value: model,
    })),
    ...Providers[provider as keyof typeof Providers].speechModels.map((model) => ({
      title: `${model} (Text to Speech)`,
      value: model,
    })),
  ];

  const { model } = await prompts({
    name: "model",
    type: "select",
    message: "Select a model",
    choices: models,
  });

  config.builtInModels = [model];

  const { shouldCreateExample } = await prompts({
    name: "shouldCreateExample",
    message: "Do you want to include a typescript example app?",
    type: "confirm",
  });

  const { useCloud } = await prompts({
    name: "useCloud",
    message:
      "Are you planning to integrate with AgentMark Cloud or just use local development?",
    type: "select",
    choices: [
      { title: "AgentMark Cloud", value: "cloud" },
      { title: "Local Development", value: "local" },
    ],
  });

  const { editor } = await prompts({
    name: "editor",
    type: "select",
    message:
      "Select an AI editor to add AgentMark rules (rules provide AI assistance for writing prompts and datasets in your editor)",
    choices: [
      { title: "Cursor", value: "cursor" },
      { title: "Windsurf", value: "windsurf" },
      { title: "Copilot", value: "copilot" },
      { title: "None", value: "none" },
    ],
  });

  createExampleApp(provider, model, useCloud, shouldCreateExample, editor);

  if (useCloud === "cloud") {
    fs.writeJsonSync("agentmark.json", config, { spaces: 2 });
    console.log(
      "🚀 Deploy your AgentMark app: https://docs.agentmark.co/platform/getting_started/quickstart"
    );
  }
};

export default init;
