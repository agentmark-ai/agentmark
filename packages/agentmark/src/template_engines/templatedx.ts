import { TagPluginRegistry, transform } from "@puzzlet/templatedx";
import { TagPlugin, PluginContext, getFrontMatter } from "@puzzlet/templatedx";
import type { Ast } from "@puzzlet/templatedx";
import type { Node } from "mdast";
import { TemplateEngine, ChatMessage, JSONObject, ObjectConfig, TextConfig, ImageConfig } from "../types";

type ExtractedField = {
  name: string;
  content: string;
}

type SharedContext = {
  "__puzzlet-extractTextPromises"?: Promise<ExtractedField>[];
}

export class ExtractTextPlugin extends TagPlugin {
  async transform(
    _props: Record<string, any>,
    children: Node[],
    pluginContext: PluginContext
  ): Promise<Node[] | Node> {
    const { scope, tagName, createNodeTransformer, nodeHelpers } =
      pluginContext;

    if (!tagName) {
      throw new Error("elementName must be provided in pluginContext");
    }

    const promise = new Promise(async (resolve, reject) => {
      try {
        const childScope = scope.createChild();
        const transformer = createNodeTransformer(childScope);
        const processedChildren = await Promise.all(
          children.map(async (child) => {
            const result = await transformer.transformNode(child);
            return Array.isArray(result) ? result : [result];
          })
        );
        const flattenedChildren = processedChildren.flat();
        const extractedText = nodeHelpers.toMarkdown({
          type: "root",
          // @ts-ignore
          children: flattenedChildren,
        });
        resolve({ content: extractedText.trim(), name: tagName });
      } catch (error) {
        reject(error);
      }
    });

    const promises = scope.getShared("__puzzlet-extractTextPromises");
    if (!promises) {
      scope.setShared("__puzzlet-extractTextPromises", [promise]);
    } else {
      promises.push(promise);
    }

    return [];
  }
}

TagPluginRegistry.register(new ExtractTextPlugin(), ["User", "System", "Assistant"]);

type CompiledConfig = {
  name: string;
  messages: ChatMessage[];
  image_config?: ImageConfig;
  object_config?: ObjectConfig;
  text_config?: TextConfig;
};

export class TemplateDXTemplateEngine implements TemplateEngine {
  async compile<
    R = CompiledConfig,
    P extends Record<string, any> = JSONObject,
  >(template: Ast, props?: P): Promise<R> {
    return getRawConfig(template, props) as R;
  }
}

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

export async function getRawConfig<
  R extends ObjectConfig | ImageConfig | TextConfig
>(ast: Ast, props?: JSONObject): Promise<R> {
  const frontMatter: any = getFrontMatter(ast);
  const shared: SharedContext = {};
  await transform(ast, props || {}, shared);
  const extractedFieldPromises = shared["__puzzlet-extractTextPromises"] || [];
  const messages = getMessages(await Promise.all(extractedFieldPromises));

  return {
    name: frontMatter.name,
    messages: messages,
    ...(frontMatter.image_config && { image_config: frontMatter.image_config }),
    ...(frontMatter.object_config && { object_config: frontMatter.object_config }),
    ...(frontMatter.text_config && { text_config: frontMatter.text_config }),
  };
}
