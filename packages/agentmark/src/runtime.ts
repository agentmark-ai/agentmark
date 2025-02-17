import type { Ast } from "@puzzlet/templatedx";
import {
  TagPluginRegistry,
  transform,
  getFrontMatter,
} from "@puzzlet/templatedx";
import { ModelPluginRegistry } from "./model-plugin-registry";
import {
  AgentMark,
  ChatMessage,
  GenerateObjectOutput,
  StreamObjectOutput,
  InferenceOptions,
  GenerateTextOutput,
  StreamTextOutput,
} from "./types";
import { ExtractTextPlugin } from "./extract-text";
import { AgentMarkSchema } from "./schemas";
import { IPluginAPI, PluginAPI } from "./plugin-api";
import Ajv from "ajv";
import { DeserializeConfig } from "./types";

const ajv = new Ajv();

type ExtractedField = {
  name: string;
  content: string;
};

type SharedContext = {
  "__puzzlet-extractTextPromises"?: Promise<ExtractedField>[];
};

TagPluginRegistry.register(new ExtractTextPlugin(), [
  "User",
  "System",
  "Assistant",
]);

function getMessages(extractedFields: Array<any>): ChatMessage[] {
  const messages: ChatMessage[] = [];
  extractedFields.forEach((field, index) => {
    const fieldName = field.name.toLocaleLowerCase();
    if (index !== 0 && fieldName === "system") {
      throw new Error(
        `System message may only be the first message only: ${field.content}`
      );
    }
    messages.push({ role: fieldName, content: field.content });
  });
  return messages;
}

export async function getRawConfig<I extends Record<string, any>>(
  ast: Ast,
  props?: I
) {
  const frontMatter: any = getFrontMatter(ast);
  const shared: SharedContext = {};
  await transform(ast, props || {}, shared);
  const extractedFieldPromises = shared["__puzzlet-extractTextPromises"] || [];
  const messages = getMessages(await Promise.all(extractedFieldPromises));

  frontMatter.metadata.model.settings =
    frontMatter.metadata?.model?.settings || {};

  const agentMark: AgentMark = AgentMarkSchema.parse({
    name: frontMatter.name,
    messages: messages,
    metadata: frontMatter.metadata,
  });
  return agentMark;
}

const baseOperations = async (
  ast: Ast,
  props: Record<string, any>,
  options?: InferenceOptions
) => {
  const agentMark = await getRawConfig(ast, props);
  const plugin = ModelPluginRegistry.getPlugin(agentMark.metadata.model.name);
  if (!plugin) {
    throw new Error(
      `No registered plugin for ${agentMark.metadata.model.name}`
    );
  }

  const frontMatter = getFrontMatter(ast) as {
    input_schema?: Record<string, any>;
    metadata?: {
      model?: {
        settings?: {
          schema?: Record<string, any>;
        };
      };
    };
  };

  if (frontMatter.input_schema) {
    const validate = ajv.compile(frontMatter.input_schema);
    if (!validate(props)) {
      throw new Error(`Invalid input: ${ajv.errorsText(validate.errors)}`);
    }
  }

  const inferenceOptions = {
    ...options,
    telemetry: {
      ...options?.telemetry,
      metadata: {
        ...options?.telemetry?.metadata,
        promptName: agentMark.name,
      },
    },
  };

  return {
    agentMark,
    inferenceOptions,
    plugin,
  };
};

export async function generateObject<Input extends Record<string, any>, Output>(
  ast: Ast,
  props: Input,
  options?: InferenceOptions
): Promise<GenerateObjectOutput<Output>> {
  const { agentMark, inferenceOptions, plugin } = await baseOperations(
    ast,
    props,
    options
  );

  const response = await plugin.generateObject<Output>(
    agentMark,
    PluginAPI,
    inferenceOptions
  );

  if (agentMark.metadata?.model?.settings?.schema) {
    const validate = ajv.compile(agentMark.metadata.model.settings.schema);
    if (!validate(response.object)) {
      throw new Error(`Invalid output: ${ajv.errorsText(validate.errors)}`);
    }
  }

  return response;
}

export async function streamObject<Input extends Record<string, any>, Output>(
  ast: Ast,
  props: Input,
  options?: InferenceOptions
): Promise<StreamObjectOutput<Output>> {
  const { agentMark, inferenceOptions, plugin } = await baseOperations(
    ast,
    props,
    options
  );

  const response = await plugin.streamObject<Output>(
    agentMark,
    PluginAPI,
    inferenceOptions
  );

  // TODO: validate the output chunks

  return response;
}

export async function generateText(
  ast: Ast,
  props: Record<string, any>,
  options?: InferenceOptions
): Promise<GenerateTextOutput> {
  const { agentMark, inferenceOptions, plugin } = await baseOperations(
    ast,
    props,
    options
  );

  return plugin.generateText(agentMark, PluginAPI, inferenceOptions);
}

export async function streamText(
  ast: Ast,
  props: Record<string, any>,
  options?: InferenceOptions
): Promise<StreamTextOutput> {
  const { agentMark, inferenceOptions, plugin } = await baseOperations(
    ast,
    props,
    options
  );
  return plugin.streamText(agentMark, PluginAPI, inferenceOptions);
}

export function serialize(
  completionParams: any,
  model: string,
  promptName: string
) {
  const plugin = ModelPluginRegistry.getPlugin(model);
  return plugin?.serialize(completionParams, promptName, PluginAPI);
}

export async function deserialize(
  ast: Ast,
  props = {},
  config?: DeserializeConfig
) {
  const agentMark = await getRawConfig(ast, props);
  const plugin = ModelPluginRegistry.getPlugin(agentMark.metadata.model.name);
  if (!plugin) {
    throw new Error(
      `No registered plugin for ${agentMark.metadata.model.name}`
    );
  }
  return plugin.deserialize(agentMark, PluginAPI, config);
}

export const getModel = (ast: Ast) => {
  const frontMatter = getFrontMatter(ast) as any;
  return frontMatter.metadata.model.name;
};

export interface Template<Input extends Record<string, any>, Output> {
  content: Ast;
  generateObject: (props: Input, options?: InferenceOptions) => Promise<GenerateObjectOutput<Output>>;
  streamObject: (props: Input, options?: InferenceOptions) => Promise<StreamObjectOutput<Output>>;
  generateText: (props: Input, options?: InferenceOptions) => Promise<GenerateTextOutput>;
  streamText: (props: Input, options?: InferenceOptions) => Promise<StreamTextOutput>;
  deserialize: (props: Input, config?: DeserializeConfig) => Promise<any>;
}

export function createTemplateRunner<Input extends Record<string, any>, Output>(
  ast: Ast
) {
  return {
    generateObject: (props: Input, options?: InferenceOptions) =>
      generateObject<Input, Output>(ast, props, options),
    streamObject: (props: Input, options?: InferenceOptions) =>
      streamObject<Input, Output>(ast, props, options),
    generateText: (props: Input, options?: InferenceOptions) =>
      generateText(ast, props, options),
    streamText: (props: Input, options?: InferenceOptions) =>
      streamText(ast, props, options),
    compile: (props?: Input) => getRawConfig(ast, props),
    deserialize: (props: Input, config?: DeserializeConfig) =>
      deserialize(ast, props, config),
  };
}
