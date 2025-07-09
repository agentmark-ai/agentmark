import { TemplateDX, TagPlugin, PluginContext } from "@agentmark/templatedx";
import type { Node } from "mdast";
import type { ImagePart, TextPart, FilePart } from "ai";

type ExtractedField = {
  name: string;
  content: string | Array<TextPart | ImagePart | FilePart>;
};

type SharedContext = {
  "__agentmark-extractTextPromises"?: Promise<ExtractedField>[];
};

const USER = "User";
const SYSTEM = "System";
const ASSISTANT = "Assistant";
const SPEECH_PROMPT = "SpeechPrompt";
const IMAGE_PROMPT = "ImagePrompt";

class ExtractTextPlugin extends TagPlugin {
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
        if (tagName === USER) {
          childScope.setShared("__insideMessageType", USER);
        }

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

        const mediaParts = scope.getShared("__agentmark-mediaParts") || [];
        const hasMediaContent = tagName === USER && mediaParts.length;
        const content = hasMediaContent
          ? [{ type: "text", text: extractedText.trim() }, ...mediaParts]
          : extractedText.trim();

        resolve({
          content,
          name: tagName,
        });
      } catch (error) {
        reject(error);
      }
    });

    const mediaParts = scope.getShared("__agentmark-mediaParts") || [];
    const promises = scope.getShared("__agentmark-extractTextPromises");
    if (promises) {
      promises.push(promise);
    } else {
      scope.setShared("__agentmark-extractTextPromises", [promise]);
    }

    return [];
  }
}

class ExtractMediaPlugin extends TagPlugin {
  private readonly key = "__agentmark-mediaParts";
  async transform(
    props: Record<string, any>,
    _children: Node[],
    pluginContext: PluginContext
  ): Promise<Node[]> {
    const { tagName, scope } = pluginContext;
    if (!tagName) throw new Error("Missing tagName in pluginContext");

    const isInsideUser = scope.getShared("__insideMessageType");
    if (!(isInsideUser === USER))
      throw new Error(
        "ImageAttachment and FileAttachment tags must be inside User tag."
      );

    const mediaParts = scope.getShared(this.key) || [];

    if (tagName === "ImageAttachment") {
      const { image, mimeType } = props;

      if (image == undefined) {
        throw new Error("ImageAttachment must contains an image prop");
      }

      if (image) {
        mediaParts.push({
          type: "image",
          image,
          ...(mimeType && { mimeType }),
        });
      }
    } else if (tagName === "FileAttachment") {
      const { data, mimeType } = props;
      if (data == undefined || mimeType == undefined) {
        throw new Error("FileAttachment must contains data and mimeType props");
      }
      if (data && mimeType) {
        mediaParts.push({ type: "file", data, mimeType });
      }
    }
    scope.setShared(this.key, mediaParts);
    return [];
  }
}

export const imageTemplateDX = new TemplateDX();

export const speechTemplateDX = new TemplateDX();

export const languageTemplateDX = new TemplateDX();

const extractMediaPlugin = new ExtractMediaPlugin();
const extractTextPlugin = new ExtractTextPlugin();

imageTemplateDX.registerTagPlugin(extractTextPlugin, [IMAGE_PROMPT]);
speechTemplateDX.registerTagPlugin(extractTextPlugin, [SYSTEM, SPEECH_PROMPT]);
languageTemplateDX.registerTagPlugin(extractTextPlugin, [USER, SYSTEM, ASSISTANT]);
languageTemplateDX.registerTagPlugin(extractMediaPlugin, [
  "ImageAttachment",
  "FileAttachment",
]);

export function getTemplateDXInstance(type: 'image' | 'speech' | 'language'): TemplateDX {
  switch (type) {
    case 'image':
      return imageTemplateDX;
    case 'speech':
      return speechTemplateDX;
    case 'language':
      return languageTemplateDX;
    default:
      throw new Error(`Unknown prompt type: ${type}`);
  }
}

export function determinePromptType(frontMatter: any): 'image' | 'speech' | 'language' {
  if (frontMatter.image_config) {
    return 'image';
  }
  if (frontMatter.speech_config) {
    return 'speech';
  }
  if (frontMatter.text_config || frontMatter.object_config) {
    return 'language';
  }
  
  return 'language';
}