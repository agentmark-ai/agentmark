import type { Ast } from "@puzzlet/templatedx";
import { TagPluginRegistry, transform, getFrontMatter } from "@puzzlet/templatedx";
import { ModelPluginRegistry } from "./model-plugin-registry";
import { JSONObject, AgentMark, ChatMessage, InferenceOptions } from "./types";
import { ExtractTextPlugin } from "./extract-text";
import { AgentMarkSchema } from "./schemas";
import { PluginAPI } from "./plugin-api";

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

export async function getRawConfig(ast: Ast, props = {}) {
  const frontMatter: any = getFrontMatter(ast);
  const shared: SharedContext = {};
  await transform(ast, props, shared);
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

export async function runInference(
  ast: Ast,
  props: JSONObject = {},
  options?: InferenceOptions
) {
  const agentMark = await getRawConfig(ast, props);
  const plugin = ModelPluginRegistry.getPlugin(
    agentMark.metadata.model.name
  );
  if (!plugin) {
    throw new Error(`No registered plugin for ${agentMark.metadata.model.name}`);
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

  return plugin?.runInference(agentMark, PluginAPI, inferenceOptions);
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
  return plugin?.deserialize(agentMark, PluginAPI);
}

export const getModel = (ast: Ast) => {
  const frontMatter = getFrontMatter(ast) as any;
  return frontMatter.metadata.model.name;
};
