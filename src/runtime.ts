import type { Ast } from "@puzzlet/templatedx";
import { TagPluginRegistry, transform, getFrontMatter } from "@puzzlet/templatedx";
import { ModelPluginRegistry } from "./model-plugin-registry";
import { JSONObject, PromptDX, ChatMessage } from "./types";
import { ExtractTextPlugin } from "./templatedx-plugins/extract-text";
import { PromptDXSchema } from "./schemas";

type ExtractedField = {
  name: string;
  content: string;
}

type SharedContext = {
  "_puuzlet-extractTextPromises"?: Promise<ExtractedField>[];
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
  const extractedFieldPromises = shared["_puuzlet-extractTextPromises"] || [];
  const messages = getMessages(await Promise.all(extractedFieldPromises));

  frontMatter.metadata.model.settings = frontMatter.metadata?.model?.settings || {};

  const promptDX: PromptDX = PromptDXSchema.parse({
    name: frontMatter.name,
    messages: messages,
    metadata: frontMatter.metadata,
  });
  return promptDX;
}

export async function runInference(
  ast: Ast,
  props: JSONObject = {},
) {
  const promptDX = await getRawConfig(ast, props);
  const plugin = ModelPluginRegistry.getPlugin(
    promptDX.metadata.model.name
  );
  if (!plugin) {
    throw new Error(`No registered plugin for ${promptDX.metadata.model.name}`);
  }
  return plugin?.runInference(promptDX);
}

export function serialize(
  completionParams: any,
  model: string,
  promptName: string
) {
  const plugin = ModelPluginRegistry.getPlugin(model);
  return plugin?.serialize(completionParams, promptName);
}

export async function deserialize(ast: Ast, props = {}) {
  const promptDX = await getRawConfig(ast, props);
  const plugin = ModelPluginRegistry.getPlugin(
    promptDX.metadata.model.name
  );
  return plugin?.deserialize(promptDX);
}

export const getModel = (ast: Ast) => {
  const frontMatter = getFrontMatter(ast) as any;
  return frontMatter.metadata.model.name;
};
