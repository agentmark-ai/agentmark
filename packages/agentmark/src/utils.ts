import {
  AgentMarkTextSettings,
  ChatMessage,
  GenerateObjectOutput,
  GenerateTextOutput,
  InferenceOptions,
  JSONObject,
  StreamObjectOutput,
  StreamTextOutput,
} from "./types";
import { jsonSchema, LanguageModel } from "ai";
import { AgentMarkSettings, AISDKBaseSettings } from "./types";
import {
  streamObject as streamObjectAI,
  streamText as streamTextAI,
  generateObject as generateObjectAI,
  generateText as generateTextAI,
} from "ai";
import { ToolPluginRegistry } from "./tool-plugin-registry";
import { AgentMarkSettingsSchema } from "./schemas";

const OUTPUT_VERSION = "v3.0";

export function omit<T extends JSONObject>(
  obj: T,
  ...keysToOmit: (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key) && !keysToOmit.includes(key)) {
      result[key] = obj[key];
    }
  }

  return result;
}

export function toFrontMatter(content: JSONObject): string {
  function jsonToFrontMatter(json: JSONObject, indent = 0) {
    let frontMatter = "";
    const indentation = "  ".repeat(indent);

    for (const key in json) {
      if (json.hasOwnProperty(key)) {
        const value = json[key];

        if (typeof value === "object" && !Array.isArray(value)) {
          frontMatter += `${indentation}${key}:\n`;
          frontMatter += jsonToFrontMatter(value, indent + 1);
        } else if (Array.isArray(value)) {
          frontMatter += `${indentation}${key}:\n`;
          value.forEach((item) => {
            if (typeof item === "object") {
              frontMatter += `${indentation}-\n`;
              frontMatter += jsonToFrontMatter(item, indent + 2);
            } else {
              frontMatter += `${indentation}- ${item}\n`;
            }
          });
        } else {
          frontMatter += `${indentation}${key}: ${value}\n`;
        }
      }
    }

    return frontMatter;
  }

  return `---\n${jsonToFrontMatter(content)}---\n`;
}

export function getEnv(key: string) {
  if (process.env[key]) {
    return process.env[key];
  }

  throw new Error(`Env not found: ${key}`);
}

export function createToolsConfig(tools: AgentMarkTextSettings["tools"]) {
  if (!tools) return undefined;
  return Object.entries(tools).reduce((acc: any, [toolName, toolData]) => {
    const toolFn = ToolPluginRegistry.getTool(toolName);
    acc[toolName] = {
      description: toolData.description,
      parameters: jsonSchema(toolData.parameters as any),
      execute: toolFn,
    };
    return acc;
  }, {});
}

export function getBaseSettings(
  config: AgentMarkSettings,
  model: LanguageModel,
  messages: Array<ChatMessage>
): AISDKBaseSettings {
  return {
    messages: messages,
    model: model,
    maxTokens: config.max_tokens,
    temperature: config.temperature,
    topK: config.top_k,
    maxSteps: config.max_llm_calls,
    topP: config.top_p,
    presencePenalty: config.frequency_penalty,
    stopSequences: config.stop_sequences,
    seed: config.seed,
    maxRetries: config.max_retries,
    headers: config.headers,
  };
}

export async function generateText(
  config: AgentMarkSettings,
  model: LanguageModel,
  messages: Array<ChatMessage>,
  options?: InferenceOptions
): Promise<GenerateTextOutput> {
  const baseConfig = getBaseSettings(config, model, messages);
  baseConfig.experimental_telemetry = options?.telemetry;
  const settings = AgentMarkSettingsSchema.parse(config);
  const tools = createToolsConfig(settings.tools);
  const result = await generateTextAI({
    ...baseConfig,
    tools,
  });
  (result as any).version = OUTPUT_VERSION;
  return result as GenerateTextOutput;
}

export async function generateObject(
  config: AgentMarkSettings,
  model: LanguageModel,
  messages: Array<ChatMessage>,
  options?: InferenceOptions
): Promise<GenerateObjectOutput> {
  const baseConfig = getBaseSettings(config, model, messages);
  baseConfig.experimental_telemetry = options?.telemetry;
  const settings = AgentMarkSettingsSchema.parse(config);
  const result = await generateObjectAI({
    ...baseConfig,
    schema: jsonSchema(settings.schema as any),
  });
  (result as any).version = OUTPUT_VERSION;
  return result as GenerateObjectOutput;
}

export async function streamText(
  config: AgentMarkSettings,
  model: LanguageModel,
  messages: Array<ChatMessage>,
  options?: InferenceOptions
): Promise<StreamTextOutput> {
  const baseConfig = getBaseSettings(config, model, messages);
  baseConfig.experimental_telemetry = options?.telemetry;
  const settings = AgentMarkSettingsSchema.parse(config);
  const result = streamTextAI({
    ...baseConfig,
    tools: createToolsConfig(settings.tools),
  });

  (result as any).version = OUTPUT_VERSION;
  return result as StreamTextOutput;
}

export async function streamObject(
  config: AgentMarkSettings,
  model: LanguageModel,
  messages: Array<ChatMessage>,
  options?: InferenceOptions
): Promise<StreamObjectOutput> {
  const baseConfig = getBaseSettings(config, model, messages);
  baseConfig.experimental_telemetry = options?.telemetry;
  const settings = AgentMarkSettingsSchema.parse(config);
  const result = streamObjectAI({
    ...baseConfig,
    schema: jsonSchema(settings.schema as any),
  });
  (result as any).version = OUTPUT_VERSION;
  return result as StreamObjectOutput;
}

