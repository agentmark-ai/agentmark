import {
  streamText,
  generateText,
  generateObject,
  experimental_generateImage as generateImage,
  experimental_generateSpeech as generateSpeech,
} from "ai";
import { TemplateDXTemplateEngine } from "@agentmark/agentmark-core";
import { createAgentMarkClient, VercelAIModelRegistry } from "@agentmark/vercel-ai-v4-adapter";
import { getFrontMatter, load } from "@agentmark/templatedx";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { FileLoader } from "@agentmark/agentmark-core";
import * as path from "path";
import * as fs from "fs";

// Set up model registry
const modelRegistry = new VercelAIModelRegistry();

modelRegistry.registerModels(
  [
    "gpt-4o",
    "gpt-4o-mini", 
    "gpt-4-turbo",
    "gpt-4",
    "o1-mini",
    "o1-preview",
    "gpt-3.5-turbo",
  ],
  (name, options) => {
    const provider = createOpenAI(options);
    return provider(name);
  }
);

modelRegistry.registerModels(
  ["dall-e-3", "dall-e-2"],
  (name, options) => {
    const provider = createOpenAI(options);
    return provider.image(name);
  }
);

modelRegistry.registerModels(
  ["tts-1-hd", "tts-1", "gpt-4o-mini-tts"],
  (name, options) => {
    const provider = createOpenAI(options);
    return provider.speech(name);
  }
);

modelRegistry.registerModels(
  [
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229", 
    "claude-3-haiku-20240307",
  ],
  (name, options) => {
    const provider = createAnthropic(options);
    return provider(name);
  }
);

const modelProviderMap = {
  // OpenAI models
  "gpt-4o": "openai",
  "gpt-4o-mini": "openai",
  "gpt-4-turbo": "openai",
  "gpt-4": "openai",
  "o1-mini": "openai",
  "o1-preview": "openai",
  "gpt-3.5-turbo": "openai",
  "dall-e-3": "openai",
  "dall-e-2": "openai",
  "tts-1-hd": "openai",
  "tts-1": "openai",
  "gpt-4o-mini-tts": "openai",

  // Anthropic models
  "claude-3-opus-20240229": "anthropic",
  "claude-3-sonnet-20240229": "anthropic", 
  "claude-3-haiku-20240307": "anthropic",
};

const templateEngine = new TemplateDXTemplateEngine();

// Simple execution handlers
const handleTextExecution = async (inputs, useDataset) => {
  console.log("Text Prompt Results:\n");
  let entryIndex = 1;
  
  const reader = inputs.getReader();
  try {
    while (true) {
      const { done, value: input } = await reader.read();
      if (done) break;
      
      if (entryIndex > 1) {
        console.log(`\n--- Result for Entry ${entryIndex} ---`);
      }
      
      if (useDataset) {
        const result = await generateText(input);
        console.log(result.text);
      } else {
        const { textStream } = streamText(input);
        for await (const chunk of textStream) {
          process.stdout.write(chunk);
        }
        process.stdout.write('\n');
      }
      entryIndex++;
    }
  } finally {
    reader.releaseLock();
  }
};

const handleObjectExecution = async (inputs, useDataset) => {
  console.log("Object Prompt Results:\n");
  let entryIndex = 1;
  
  const reader = inputs.getReader();
  try {
    while (true) {
      const { done, value: input } = await reader.read();
      if (done) break;
      
      if (entryIndex > 1) {
        console.log(`\n--- Result for Entry ${entryIndex} ---`);
      }
      
      const { object } = await generateObject(input);
      console.log(JSON.stringify(object, null, 2));
      entryIndex++;
    }
  } finally {
    reader.releaseLock();
  }
};

const executionHandlerMap = {
  text: handleTextExecution,
  object: handleObjectExecution,
  image: async (inputs) => console.log("Image generation not fully implemented in test"),
  speech: async (inputs) => console.log("Speech generation not fully implemented in test"),
};

const runPrompt = async ({
  ast,
  promptKind,
  apiKey,
  runMode,
  fileLoader,
}) => {
  const agentMark = createAgentMarkClient({
    modelRegistry,
    loader: fileLoader,
  });
  
  const loaderMap = {
    text: (ast) => agentMark.loadTextPrompt(ast),
    object: (ast) => agentMark.loadObjectPrompt(ast),
    image: (ast) => agentMark.loadImagePrompt(ast),
    speech: (ast) => agentMark.loadSpeechPrompt(ast),
  };
  
  const promptLoader = loaderMap[promptKind];
  const prompt = await promptLoader(ast);

  let vercelInputs;

  if (runMode === "dataset") {
    vercelInputs = await prompt.formatWithDataset({ apiKey });
  } else {
    const vercelInput = await prompt.formatWithTestProps({ apiKey });
    vercelInputs = new ReadableStream({
      start(controller) {
        controller.enqueue(vercelInput);
        controller.close();
      },
    });
  }

  const configExecute = executionHandlerMap[promptKind];
  await configExecute(vercelInputs, runMode === "dataset");
};

// Main function to test
async function testRunPrompt() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: node test-run-prompt.mjs <prompt-file.mdx> [--dataset]");
    console.log("Environment variables needed: OPENAI_API_KEY or ANTHROPIC_API_KEY");
    process.exit(1);
  }

  const filePath = args[0];
  const useDataset = args.includes("--dataset");

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  if (!filePath.endsWith(".mdx")) {
    console.error("Error: File must have .mdx extension");
    process.exit(1);
  }

  const fileDirectory = path.dirname(path.resolve(filePath));
  const fileLoader = new FileLoader(fileDirectory);

  try {
    let ast = await load(filePath);
    const frontmatter = getFrontMatter(ast);

    const compiledYaml = await templateEngine.compile({ template: ast });
    let promptKind;
    let promptConfig;

    if (compiledYaml?.image_config) {
      promptKind = "image";
      promptConfig = compiledYaml.image_config;
    } else if (compiledYaml?.object_config) {
      promptKind = "object";
      promptConfig = compiledYaml.object_config;
    } else if (compiledYaml?.text_config) {
      promptKind = "text";
      promptConfig = compiledYaml.text_config;
    } else if (compiledYaml?.speech_config) {
      promptKind = "speech";
      promptConfig = compiledYaml.speech_config;
    } else {
      console.error(
        "Error: No config (image_config, object_config, text_config, or speech_config) found in the file."
      );
      process.exit(1);
    }

    const modelName = promptConfig?.model_name || "";

    if (!modelProviderMap[modelName]) {
      console.error(`Error: Unsupported model name: ${modelName}`);
      process.exit(1);
    }

    const envVarName = modelProviderMap[modelName] === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    const apiKey = process.env[envVarName];

    if (!apiKey) {
      console.error(`Error: API key not provided. Set ${envVarName} environment variable.`);
      process.exit(1);
    }

    const runMode = useDataset ? "dataset" : "default";

    console.log(`Running ${promptKind} prompt with ${modelName} in ${runMode} mode...\n`);

    await runPrompt({
      ast,
      promptKind,
      apiKey,
      runMode,
      fileLoader,
    });

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Run the test
testRunPrompt().catch(console.error);