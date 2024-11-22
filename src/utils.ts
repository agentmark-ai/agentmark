import { JSONObject } from "./types";
import { jsonSchema } from "ai";
import { Output } from "./types";
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
    const indentation = "  ".repeat(indent); // For nested indentation

    for (const key in json) {
      if (json.hasOwnProperty(key)) {
        const value = json[key];

        if (typeof value === "object" && !Array.isArray(value)) {
          // Nested object
          frontMatter += `${indentation}${key}:\n`;
          frontMatter += jsonToFrontMatter(value, indent + 1); // Recursive call
        } else if (Array.isArray(value)) {
          // Array handling
          frontMatter += `${indentation}${key}:\n`;
          value.forEach((item) => {
            if (typeof item === "object") {
              frontMatter += `${indentation}-\n`;
              frontMatter += jsonToFrontMatter(item, indent + 2); // Nested objects in array
            } else {
              frontMatter += `${indentation}- ${item}\n`;
            }
          });
        } else {
          // Primitive value (string, number, boolean, etc.)
          frontMatter += `${indentation}${key}: ${value}\n`;
        }
      }
    }

    return frontMatter;
  }

  return `---\n${jsonToFrontMatter(content)}---\n`;
}

export function getEnv(key: string) {
  if(process.env[key]) {
    return process.env[key];
  } 
  
  throw new Error(`Env not found: ${key}`);
}

export function snakeToCamel(snakeStr: string) {
  return snakeStr
      .toLowerCase()
      .split('_')
      .map((word, index) =>
          index === 0
              ? word
              : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join('');
}

export function transformKeysToCamelCase(obj: Object) {
  const transform = (input: Object): any => {
      if (Array.isArray(input)) {
          return input.map((item) => (typeof item === 'object' ? transform(item) : item));
      } else if (typeof input === 'object' && input !== null) {
          return Object.entries(input).reduce((acc: any, [key, value]) => {
              const newKey = snakeToCamel(key);
              acc[newKey] = typeof value === 'object' && value !== null ? transform(value) : value;
              return acc;
          }, {});
      }
      return input;
  };

  return transform(obj);
}

export function transformParameters(tools: Object) {
  return Object.entries(tools).reduce((acc: any, [toolName, toolData]) => {
    acc[toolName] = {
      ...toolData,
      parameters: jsonSchema(toolData.parameters),
    };
    return acc;
  }, {});
}

export function getInferenceConfig(providerModel: any, messages: any, { stream, ...settings }: any): any {
  const config = { model: providerModel, messages, ...transformKeysToCamelCase(settings) };
  if (config.tools) {
    config.tools = transformParameters(config.tools);
  }
  if (config.schema) {
    config.schema = jsonSchema(config.schema);
  }
  const options = { stream: !!stream, hasSchema: !!config.schema }
  return { config, options };
}

export async function runInference(config: any, options: any): Promise<Output> {
  const { hasSchema, stream } = options;
  if (hasSchema && stream) {
    return new Promise(async (resolve, reject) => {
      try {
        const { textStream } = streamObject({
          ...config,
          onFinish({ object, usage }) {
            resolve({
              result: { data: object as Object, type: 'text' },
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
  } else if (hasSchema) {
    const result = await generateObject(config);
    return {
      result: { data: result.object as Object, type: 'object' },
      tools: [],
      usage: result.usage,
      finishReason: result.finishReason
    }
  } else if (stream) {
    return new Promise(async (resolve, reject) => {
      try {
        const { textStream } = streamText({
          ...config,
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
    const result = await generateText(config);
    return {
      result: { data: result.text as string, type: 'text' },
      tools: result.toolCalls.map((tool) => ({ name: tool.toolName, input: tool.args })),
      usage: result.usage,
      finishReason: result.finishReason
    }
  }
}