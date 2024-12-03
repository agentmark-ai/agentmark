import { ChatMessage, InferenceOptions, JSONObject } from "./types";
import { jsonSchema, LanguageModel } from "ai";
import { AgentMarkOutput, AgentMarkSettings, AISDKBaseSettings } from "./types";
import { streamObject, streamText, generateObject, generateText } from "ai";
import { AgentMarkSettingsSchema } from "./schemas";

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

export function jsonSchemaTools(tools: Object) {
  return Object.entries(tools).reduce((acc: any, [toolName, toolData]) => {
    acc[toolName] = {
      ...toolData,
      parameters: jsonSchema(toolData.parameters),
    };
    return acc;
  }, {});
}

export function getBaseSettings(config: AgentMarkSettings, model: LanguageModel, messages: Array<ChatMessage>): AISDKBaseSettings {
  return {
    messages: messages,
    model: model,
    maxTokens: config.max_tokens,
    temperature: config.temperature,
    topK: config.top_k,
    topP: config.top_p,
    presencePenalty: config.frequency_penalty,
    stopSequences: config.stop_sequences,
    seed: config.seed,
    maxRetries: config.max_retries,
    headers: config.headers,
  };
}

export async function runInference(
  config: AgentMarkSettings,
  model: LanguageModel,
  messages: Array<ChatMessage>,
  options?: InferenceOptions
): Promise<AgentMarkOutput> {
  const { stream } = config;
  const baseConfig = getBaseSettings(config, model, messages);
  baseConfig.experimental_telemetry = options?.telemetry;
  const settings = AgentMarkSettingsSchema.parse(config);
  if ('schema' in settings && stream) {
    return new Promise(async (resolve, reject) => {
      try {
        const { textStream } = streamObject({
          ...baseConfig,
          schema: jsonSchema(settings.schema as any),
          onFinish({ object, usage }) {
            resolve({
              result: { object: object as Object },
              usage,
              finishReason: "unknown",
            });
          },
        });
        for await (const _ of textStream);
      } catch (error) {
        reject(error);
      }
    });
  } else if ("schema" in settings) {
    const result = await generateObject({
      ...baseConfig,
      schema: jsonSchema(settings.schema as any),
    });
    return {
      result: { object: result.object as Object },
      tools: [],
      usage: result.usage,
      finishReason: result.finishReason,
    };
  } else if (stream) {
    return new Promise(async (resolve, reject) => {
      try {
        const { textStream } = streamText({
          ...baseConfig,
          tools: settings.tools ? jsonSchemaTools(settings.tools) : undefined,
          onFinish({ text, usage, toolCalls, finishReason }) {
            resolve({
              result: { text },
              tools: toolCalls.map((tool) => ({
                name: tool.toolName,
                input: tool.args,
              })),
              usage,
              finishReason,
            });
          },
        });
        for await (const _ of textStream);
      } catch (error) {
        reject(error);
      }
    });
  } else {
    const result = await generateText({
      ...baseConfig,
      tools: settings.tools ? jsonSchemaTools(settings.tools) : undefined,
    });
    return {
      result: { text: result.text },
      tools: result.toolCalls.map((tool) => ({
        name: tool.toolName,
        input: tool.args,
      })),
      usage: result.usage,
      finishReason: result.finishReason,
    };
  }
}
