import { ChatMessage, JSONObject } from "./types";
import { jsonSchema, LanguageModel } from "ai";
import { PromptDXOutput, PromptDXModelSettings, AISDKObjectSettings, AISDKTextSettings, AISDKBaseSettings } from "./types";
import { streamObject, streamText, generateObject, generateText } from "ai";

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

export function transformBaseConfig(config: PromptDXModelSettings, model: LanguageModel, messages: Array<ChatMessage>): AISDKBaseSettings {
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
    abortSignal: config.abort_signal,
    headers: config.headers,
  };
}

export function transformObjectConfig(config: PromptDXModelSettings, model: LanguageModel, messages: Array<ChatMessage>): AISDKObjectSettings<Object> {
  return {
    ...transformBaseConfig(config, model, messages),
    model,
    schema: jsonSchema(config.schema),
  }
}

export function transformTextConfig(config: PromptDXModelSettings, model: LanguageModel, messages: Array<ChatMessage>): AISDKTextSettings {
  return {
    ...transformBaseConfig(config, model, messages),
    tools: config.tools ? jsonSchemaTools(config.tools) : [],
  }
}

export async function runInference(config: PromptDXModelSettings, model: LanguageModel, messages: Array<ChatMessage>): Promise<PromptDXOutput> {
  const { schema, stream } = config;
  if (schema && stream) {
    const schemaConfig = transformObjectConfig(config, model, messages);
    return new Promise(async (resolve, reject) => {
      try {
        const { textStream } = streamObject({
          ...schemaConfig,
          output: 'object',
          onFinish({ object, usage }) {
            resolve({
              result: { data: object as Object, type: 'object' },
              tools: [],
              usage,
              finishReason: 'unknown'
            });
          },
        });
        for await (const _ of textStream);
      } catch (error) {
        reject(error);
      }
    });
  } else if (schema) {
    const schemaConfig = transformObjectConfig(config, model, messages);
    const result = await generateObject({ ...schemaConfig, output: 'object' });
    return {
      result: { data: result.object as Object, type: 'object' },
      tools: [],
      usage: result.usage,
      finishReason: result.finishReason
    }
  } else if (stream) {
    const textConfig = transformTextConfig(config, model, messages);
    return new Promise(async (resolve, reject) => {
      try {
        const { textStream } = streamText({
          ...textConfig,
          onFinish({ text, usage, toolCalls, finishReason }) {
            resolve({
              result: { data: text as string, type: 'text' },
              tools: toolCalls.map((tool) => ({ name: tool.toolName, input: tool.args })),
              usage,
              finishReason
            });
          },
        });
        for await (const _ of textStream);
      } catch (error) {
        reject(error);
      }
    });
  } else {
    const textConfig = transformTextConfig(config, model, messages);
    const result = await generateText(textConfig);
    return {
      result: { data: result.text as string, type: 'text' },
      tools: result.toolCalls.map((tool) => ({ name: tool.toolName, input: tool.args })),
      usage: result.usage,
      finishReason: result.finishReason
    }
  }
}