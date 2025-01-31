import type { Ast } from "@puzzlet/templatedx";
import { TagPluginRegistry, transform, getFrontMatter } from "@puzzlet/templatedx";
import { ModelPluginRegistry } from "./model-plugin-registry";
import { AgentMarkOutput, AgentMark, ChatMessage, InferenceOptions } from "./types";
import { ExtractTextPlugin } from "./extract-text";
import { AgentMarkSchema } from "./schemas";
import { PluginAPI } from "./plugin-api";
import Ajv from 'ajv';

const ajv = new Ajv();

type ExtractedField = {
  name: string;
  content: string;
}

type SharedContext = {
  "__puzzlet-extractTextPromises"?: Promise<ExtractedField>[];
}


TagPluginRegistry.register(new ExtractTextPlugin(), ["User", "System", "Assistant"]);

function getMessages(extractedFields: Array<any>): ChatMessage[] {
  const messages: ChatMessage[] = [];
  extractedFields.forEach((field, index) => {
    const fieldName = field.name.toLocaleLowerCase();
    if (index !== 0 && fieldName === 'system') {
      throw new Error(`System message may only be the first message only: ${field.content}`);
    }
    messages.push({ role: fieldName, content: field.content });
  });
  return messages;
}

export async function getRawConfig<I extends Record<string, any>>(ast: Ast, props?: I) {
  const frontMatter: any = getFrontMatter(ast);
  const shared: SharedContext = {};
  await transform(ast, props || {}, shared);
  const extractedFieldPromises = shared["__puzzlet-extractTextPromises"] || [];
  const messages = getMessages(await Promise.all(extractedFieldPromises));

  frontMatter.metadata.model.settings = frontMatter.metadata?.model?.settings || {};

  const agentMark: AgentMark = AgentMarkSchema.parse({
    name: frontMatter.name,
    messages: messages,
    metadata: frontMatter.metadata,
  });
  return agentMark;
}

export async function runInference<Input extends Record<string, any>, Output>(
  ast: Ast,
  props: Input,
  options?: InferenceOptions
): Promise<AgentMarkOutput<Output>> {
  const agentMark = await getRawConfig(ast, props);
  const plugin = ModelPluginRegistry.getPlugin(
    agentMark.metadata.model.name
  );
  if (!plugin) {
    throw new Error(`No registered plugin for ${agentMark.metadata.model.name}`);
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
        props: JSON.stringify(props),
      },
    },
  };

  const response = await plugin.runInference(agentMark, PluginAPI, inferenceOptions);

  if (frontMatter.metadata?.model?.settings?.schema) {
    const validate = ajv.compile(frontMatter.metadata.model.settings.schema);
    if (!validate(response.result)) {
      throw new Error(`Invalid output: ${ajv.errorsText(validate.errors)}`);
    }
  }

  return response;
}

export function serialize(
  completionParams: any,
  model: string,
  promptName: string
) {
  const plugin = ModelPluginRegistry.getPlugin(model);
  return plugin?.serialize(completionParams, promptName, PluginAPI);
}

export async function deserialize(ast: Ast, props = {}) {
  const agentMark = await getRawConfig(ast, props);
  const plugin = ModelPluginRegistry.getPlugin(
    agentMark.metadata.model.name
  );
  if (!plugin) {
    throw new Error(`No registered plugin for ${agentMark.metadata.model.name}`);
  }
  return plugin.deserialize(agentMark, PluginAPI);
}

export const getModel = (ast: Ast) => {
  const frontMatter = getFrontMatter(ast) as any;
  return frontMatter.metadata.model.name;
};

export interface Template<Input extends Record<string, any>, Output> {
  content: Ast;
  run: (props: Input, options?: InferenceOptions) => Promise<AgentMarkOutput<Output>>;
  compile: (props?: Input) => Promise<AgentMark>;
  deserialize: (props: Input) => Promise<any>;
}

export function createTemplateRunner<Input extends Record<string, any>, Output>(ast: Ast) {
  return {
    run: (props: Input, options?: InferenceOptions) => runInference<Input, Output>(ast, props, options),
    compile: (props?: Input) => getRawConfig(ast, props),
    deserialize: (props: Input) => deserialize(ast, props)
  };
}
