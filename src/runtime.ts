import { ModelPluginRegistry } from "./model-plugin-registry";
import type { Ast } from "@puzzlet/templatedx";
import { JSONObject } from "./types";
import {
  extractFields,
  getFrontMatter,
} from "@puzzlet/templatedx";

export interface ChatMessage {
  role: string,
  content: string,
};

export interface PromptDX {
  name: string;
  messages: Array<ChatMessage>;
  metadata: {
    model: {
      name: string;
      settings: JSONObject;
    };
    props: JSONObject;
  };
}

async function loadMdx(ast: Ast, props?: JSONObject) {
  const frontMatter: any = getFrontMatter(ast);
  const newProps = { ...(frontMatter.metadata.props || {}), ...(props || {}) };
  const extractedFields = await extractFields(ast, ["User", "System", "Assistant"], newProps);
  const messages = extractedFields.map((field) => ({ role: field.name.toLocaleLowerCase(), content: field.content }))

  if (!frontMatter.metadata || !frontMatter.name || !extractedFields.length) {
    throw new Error(`Invalid prompt.`);
  }

  const promptDX: PromptDX = {
    name: frontMatter.name,
    messages: messages,
    metadata: frontMatter.metadata,
  };
  return promptDX;
}

export async function runInference(
  ast: Ast,
  props: JSONObject = {},
) {
  const promptDX = await loadMdx(ast, props);
  const plugin = ModelPluginRegistry.getPlugin(
    promptDX.metadata.model.name
  );
  return plugin?.run(promptDX);
}

export function serialize(
  completionParams: any,
  model: string,
  promptName: string
) {
  const plugin = ModelPluginRegistry.getPlugin(model);
  return plugin?.serialize(completionParams, promptName);
}

export async function deserialize(ast: Ast) {
  const promptDX = await loadMdx(ast);
  const plugin = ModelPluginRegistry.getPlugin(
    promptDX.metadata.model.name
  );
  return plugin?.deserialize(promptDX);
}

export const registerDefaultPlugins = async () => {
  return await import("./builtin-plugins");
};

export const getModel = (ast: Ast) => {
  const frontMatter = getFrontMatter(ast) as any;
  return frontMatter.metadata.model.name;
};
