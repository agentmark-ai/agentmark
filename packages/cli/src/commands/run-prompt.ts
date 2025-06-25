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
import type { Root } from "mdast";
import { PromptKind, FileLoader } from "@agentmark/agentmark-core";
import * as path from "path";
import * as fs from "fs";

// Set up model registry similar to VSCode extension
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
  (name: string, options?: any) => {
    const provider = createOpenAI(options);
    return provider(name);
  }
);

modelRegistry.registerModels(
  ["dall-e-3", "dall-e-2"],
  (name: string, options?: any) => {
    const provider = createOpenAI(options);
    return provider.image(name);
  }
);

modelRegistry.registerModels(
  ["tts-1-hd", "tts-1", "gpt-4o-mini-tts"],
  (name: string, options?: any) => {
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
  (name: string, options?: any) => {
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

const handleTextExecution = async (
  inputs: ReadableStream<any>,
  useDataset: boolean
) => {
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
        // For datasets, use generateText (non-streaming)
        const result = await generateText(input);
        console.log(result.text);
      } else {
        // For props, use streamText (streaming)
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

const handleObjectExecution = async (
  inputs: ReadableStream<any>,
  useDataset: boolean
) => {
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
      
      // For both datasets and props, use generateObject (non-streaming)
      const { object } = await generateObject(input);
      console.log(JSON.stringify(object, null, 2));
      entryIndex++;
    }
  } finally {
    reader.releaseLock();
  }
};

const handleImageExecution = async (inputs: ReadableStream<any>) => {
  console.log("Image Prompt Results:\n");
  let entryIndex = 1;
  
  const reader = inputs.getReader();
  try {
    while (true) {
      const { done, value: input } = await reader.read();
      if (done) break;
      
      if (entryIndex > 1) {
        console.log(`\n--- Result for Entry ${entryIndex} ---`);
      }
      
      const result = await generateImage(input);
      console.log(`Generated ${result.images.length} image(s):`);
      result.images.forEach((image, idx) => {
        console.log(`Image ${idx + 1}: ${image.toString().substring(0, 100)}...`);
      });
      entryIndex++;
    }
  } finally {
    reader.releaseLock();
  }
};

const handleSpeechExecution = async (inputs: ReadableStream<any>) => {
  console.log("Speech Prompt Results:\n");
  let entryIndex = 1;
  
  const reader = inputs.getReader();
  try {
    while (true) {
      const { done, value: input } = await reader.read();
      if (done) break;
      
      if (entryIndex > 1) {
        console.log(`\n--- Result for Entry ${entryIndex} ---`);
      }
      
      const result = await generateSpeech(input);
      console.log(`Generated audio data`);
      entryIndex++;
    }
  } finally {
    reader.releaseLock();
  }
};

const executionHandlerMap = {
  text: handleTextExecution,
  object: handleObjectExecution,
  image: handleImageExecution,
  speech: handleSpeechExecution,
};

const runPrompt = async ({
  ast,
  promptKind,
  apiKey,
  runMode,
  fileLoader,
}: {
  ast: Root;
  promptKind: PromptKind;
  apiKey: string;
  runMode: "default" | "dataset";
  fileLoader: FileLoader;
}) => {
  const agentMark = createAgentMarkClient({
    modelRegistry,
    loader: fileLoader,
  });
  
  const loaderMap = {
    text: (ast: Root) => agentMark.loadTextPrompt(ast),
    object: (ast: Root) => agentMark.loadObjectPrompt(ast),
    image: (ast: Root) => agentMark.loadImagePrompt(ast),
    speech: (ast: Root) => agentMark.loadSpeechPrompt(ast),
  };
  
  const promptLoader = loaderMap[promptKind] as (ast: Root) => any;
  const prompt = await promptLoader(ast);

  let vercelInputs: ReadableStream<any>;

  if (runMode === "dataset") {
    vercelInputs = await prompt.formatWithDataset({ apiKey });
  } else {
    // Treat a single run as a stream with one item
    const vercelInput = await prompt.formatWithTestProps({ apiKey });
    vercelInputs = new ReadableStream({
      start(controller) {
        controller.enqueue(vercelInput);
        controller.close();
      },
    });
  }

  const configExecute = executionHandlerMap[promptKind] as any;
  await configExecute(vercelInputs, runMode === "dataset");
};

type RunPromptOptions = {
  dataset?: boolean;
  apiKey?: string;
};

const runPromptCommand = async (filePath: string, options: RunPromptOptions) => {
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
    let ast: Root = await load(filePath);
    const frontmatter: any = getFrontMatter(ast);

    const compiledYaml = await templateEngine.compile({ template: ast });
    let promptKind: PromptKind;
    let promptConfig: any;

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

    const modelName: string = promptConfig?.model_name || "";

    if (!modelProviderMap[modelName]) {
      console.error(`Error: Unsupported model name: ${modelName}`);
      process.exit(1);
    }

    let apiKey = options.apiKey;
    
    if (!apiKey) {
      const envVarName = modelProviderMap[modelName] === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
      apiKey = process.env[envVarName];
    }

    if (!apiKey) {
      console.error(`Error: API key not provided. Set ${modelProviderMap[modelName] === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} environment variable or use --api-key option.`);
      process.exit(1);
    }

    const runMode = options.dataset ? "dataset" : "default";

    await runPrompt({
      ast,
      promptKind,
      apiKey,
      runMode,
      fileLoader,
    });

  } catch (error: any) {
    console.error("Error:", error.message);
    process.exit(1);
  }
};

export default runPromptCommand;