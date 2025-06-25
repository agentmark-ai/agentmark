import path from "path";
import fs from "fs";
import Table from "cli-table3";
import { VercelAIModelRegistry, createAgentMarkClient } from "@agentmark/vercel-ai-v4-adapter";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { FileLoader, PromptKind, TemplateDXTemplateEngine } from "@agentmark/agentmark-core";
// Dynamic import for ESM module
import type { Root } from "mdast";
import prompts from "prompts";

// Model registry setup (similar to VSCode extension)
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
  (name: string, options: any) => {
    const provider = createOpenAI(options);
    return provider(name);
  }
);

modelRegistry.registerModels(
  ["dall-e-3", "dall-e-2"],
  (name: string, options: any) => {
    const provider = createOpenAI(options);
    return provider.image(name);
  }
);

modelRegistry.registerModels(
  ["tts-1-hd", "tts-1", "gpt-4o-mini-tts"],
  (name: string, options: any) => {
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
  (name: string, options: any) => {
    const provider = createAnthropic(options);
    return provider(name);
  }
);

const modelProviderMap: Record<string, "openai" | "anthropic"> = {
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

interface RunPromptOptions {
  input: "props" | "dataset";
}

const formatPropsResult = (result: any) => {
  console.log("\n=== Prompt Result ===");
  if (result.name) {
    console.log(`Name: ${result.name}`);
  }
  
  if (result.messages && Array.isArray(result.messages)) {
    console.log("\nMessages:");
    result.messages.forEach((msg: any, index: number) => {
      console.log(`${index + 1}. [${msg.role}]: ${msg.content}`);
    });
  } else if (result.prompt) {
    console.log(`\nPrompt: ${result.prompt}`);
  } else {
    console.log(`\nResult: ${JSON.stringify(result, null, 2)}`);
  }
};

const formatDatasetResults = async (resultsStream: any) => {
  console.log("\n=== Dataset Results ===");
  
  const table = new Table({
    head: ['#', 'Input', 'Expected Output', 'Result'],
    colWidths: [5, 40, 30, 40],
    wordWrap: true
  });

  let index = 1;
  const reader = resultsStream.getReader();
  
  try {
    while (true) {
      const { done, value: result } = await reader.read();
      if (done) break;
      
      const input = JSON.stringify(result.dataset.input, null, 0);
      const expectedOutput = result.dataset.expected_output || 'N/A';
      const formattedResult = JSON.stringify(result.formatted, null, 0);
      
      table.push([
        index.toString(),
        input,
        expectedOutput,
        formattedResult
      ]);
      
      index++;
    }
  } finally {
    reader.releaseLock();
  }
  
  console.log(table.toString());
};

const runPrompt = async (filepath: string, options: RunPromptOptions) => {
  // Validate file exists and is an .mdx file
  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }
  
  if (!filepath.endsWith('.mdx')) {
    throw new Error('File must be an .mdx file');
  }

  // Get the directory containing the prompt file
  const fileDirectory = path.dirname(path.resolve(filepath));
  const fileLoader = new FileLoader(fileDirectory);

  // Dynamic import for ESM module
  const { getFrontMatter, load } = await import("@agentmark/templatedx");
  
  // Load and parse the prompt file
  let ast: Root = await load(filepath);
  const frontmatter: any = getFrontMatter(ast);

  // Handle old format if needed (from VSCode extension logic)
  if (frontmatter?.metadata) {
    console.log("Warning: Old format detected. Please consider updating to the new format.");
  }

  const compiledYaml = await templateEngine.compile({ template: ast });
  let promptKind: PromptKind;
  let promptConfig: any;

  // Determine prompt kind based on config
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
    throw new Error("No config (image_config, object_config, text_config, or speech_config) found in the file.");
  }

  const modelName: string = promptConfig?.model_name || "";

  if (!modelProviderMap[modelName]) {
    throw new Error(`Unsupported model name: ${modelName}`);
  }

  // Get API key from environment or prompt user
  const envVarName = `${modelProviderMap[modelName].toUpperCase()}_API_KEY`;
  let apiKey = process.env[envVarName];
  
  if (!apiKey) {
    const response = await prompts({
      type: 'password',
      name: 'apiKey',
      message: `Enter your ${modelProviderMap[modelName]} API key:`,
      validate: (value: string) => value.length > 0 ? true : 'API key cannot be empty'
    });
    
    if (!response.apiKey) {
      throw new Error('API key is required');
    }
    
    apiKey = response.apiKey;
  }

  // Create AgentMark client
  const agentMark = createAgentMarkClient({
    modelRegistry,
    loader: fileLoader,
  });

  // Load the appropriate prompt type
  const loaderMap: Record<PromptKind, (ast: Root) => any> = {
    text: (ast: Root) => agentMark.loadTextPrompt(ast),
    object: (ast: Root) => agentMark.loadObjectPrompt(ast),
    image: (ast: Root) => agentMark.loadImagePrompt(ast),
    speech: (ast: Root) => agentMark.loadSpeechPrompt(ast),
  };

  const promptLoader = loaderMap[promptKind];
  const prompt = await promptLoader(ast);

  try {
    if (options.input === "dataset") {
      console.log("Running prompt with dataset...");
      const resultsStream = await prompt.formatWithDataset({ apiKey });
      await formatDatasetResults(resultsStream);
    } else {
      console.log("Running prompt with test props...");
      const result = await prompt.formatWithTestProps({ apiKey });
      formatPropsResult(result);
    }
  } catch (error: any) {
    throw new Error(`Error running prompt: ${error.message}`);
  }
};

export default runPrompt;