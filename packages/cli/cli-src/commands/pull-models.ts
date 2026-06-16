import path from "path";
import { getProviders } from "../utils/providers";
import * as fs from "fs-extra";
import prompts from "prompts";
import { detectProjectLanguage, loadAgentmarkConfig } from "../utils/project";

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
  /**
   * Instead of modifying agentmark.json, print available providers (or
   * models for `--provider <name>`) as JSON and exit. Safe for CI/agents.
   *
   * Without `--provider`: `[{ id, label, languageModels, imageModels, speechModels }]`
   * With `--provider <name>`: `{ id, label, languageModels, imageModels, speechModels }`
   */
  list?: boolean;
}

const pullModels = async (options: PullModelsOptions = {}) => {
  const providers = await getProviders();

  if (options.list) {
    if (options.provider) {
      if (!(options.provider in providers)) {
        throw new Error(
          `Unknown provider "${options.provider}". Available: ${Object.keys(providers).join(", ")}`,
        );
      }
      const p = providers[options.provider]!;
      console.log(JSON.stringify({ id: options.provider, ...p }, null, 2));
    } else {
      const list = Object.entries(providers).map(([id, p]) => ({ id, ...p }));
      console.log(JSON.stringify(list, null, 2));
    }
    return;
  }

  const agentmarkConfig = loadAgentmarkConfig();

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
    if (requested.length === 0) {
      throw new Error("--models was empty after parsing. Pass a comma-separated list.");
    }
    // Registry model IDs are provider-prefixed (`anthropic/claude-opus-4-8`).
    // With an explicit `--provider` the prefix is redundant, so accept the
    // leaf name too by resolving it against the chosen provider.
    const resolveRequested = (m: string): string =>
      m.includes("/") ? m : `${provider}/${m}`;
    const addable = new Set(modelChoices.map((m) => m.value));
    const allProviderModels = new Set(allModels.map((m) => m.value));
    const resolved: string[] = [];
    const alreadyAdded: string[] = [];
    const unknown: string[] = [];
    for (const m of requested) {
      const id = resolveRequested(m);
      if (addable.has(id)) resolved.push(id);
      else if (allProviderModels.has(id)) alreadyAdded.push(id);
      else unknown.push(m);
    }
    if (unknown.length > 0) {
      const sample = allModels[0]?.value ?? `${provider}/<model>`;
      throw new Error(
        `Unknown models for provider "${provider}": ${unknown.join(", ")}.\n` +
          `Model IDs are provider-prefixed (e.g. "${sample}"); with --provider ${provider} ` +
          `the leaf name (e.g. "${sample.split("/").slice(1).join("/")}") also works.\n` +
          `Run \`npx @agentmark-ai/cli pull-models --provider ${provider}\` without --models to list what's available.`,
      );
    }
    if (alreadyAdded.length > 0) {
      // Idempotent for CI: re-requesting a model that's already in
      // builtInModels is a no-op, not an error.
      console.log(`Already in builtInModels (skipped): ${alreadyAdded.join(", ")}`);
    }
    if (resolved.length === 0) {
      console.log("All requested models already added.");
      return;
    }
    models = [...new Set(resolved)];
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

    console.log("\n📦 Provider setup reminder:");
    if (detectProjectLanguage(process.cwd()) === "python") {
      // Python projects have no `@ai-sdk/*` packages or `.registerProviders`
      // — the executor owns the model mapping. Point there instead of
      // printing TypeScript imports that mean nothing in this project.
      console.log(
        "Make sure your executor handles models from: " +
          providerList.join(", ") +
          "\nYour executor maps each prompt's model_name to your SDK's model ID — see\n" +
          "https://docs.agentmark.co/configure/connect-your-sdk\n"
      );
    } else {
      // The hint assumes `@ai-sdk/*` providers — correct for Vercel AI SDK
      // and Mastra setups, whose model registries consume those provider
      // packages. Executor-based setups map models inside the executor and
      // get the neutral hint above instead.
      console.log(
        "Make sure these providers are registered in your model registry:\n"
      );

      for (const provider of providerList) {
        console.log(`  import { ${provider} } from "@ai-sdk/${provider}";`);
      }

      const providerObj = providerList.map((p) => p).join(", ");
      console.log(`\n  .registerProviders({ ${providerObj} })\n`);
    }
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
