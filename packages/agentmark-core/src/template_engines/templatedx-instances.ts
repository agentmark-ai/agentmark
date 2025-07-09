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

// Simple tag plugin for basic tags that just pass through their content
class BasicTagPlugin extends TagPlugin {
  async transform(
    _props: Record<string, any>,
    children: Node[],
    pluginContext: PluginContext
  ): Promise<Node[] | Node> {
    // For basic tags, we just return the children as-is
    return children;
  }
}

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

    // Handle alias: 's' -> 'System'
    const normalizedTagName = tagName === 's' ? SYSTEM : tagName;

    const promise = new Promise(async (resolve, reject) => {
      try {
        const childScope = scope.createChild();
        if (normalizedTagName === USER) {
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
        const hasMediaContent = normalizedTagName === USER && mediaParts.length;
        const content = hasMediaContent
          ? [{ type: "text", text: extractedText.trim() }, ...mediaParts]
          : extractedText.trim();

        resolve({
          content,
          name: normalizedTagName,
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

    /*
     * For both ImageAttachment and FileAttachment, we need to ensure the required prop
     * Are defined (even if they are an empty string or passed from inputProps).
     * This allows for placeholders like image={props.image}, which resolve later during formatting.
     */

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

/**
 * TemplateDX instance dedicated to Image processing
 * This instance can have specialized plugins and filters for image generation prompts
 */
export const imageTemplateDX = new TemplateDX({
  includeBuiltins: true
});

/**
 * TemplateDX instance dedicated to Speech processing  
 * This instance can have specialized plugins and filters for speech generation prompts
 */
export const speechTemplateDX = new TemplateDX({
  includeBuiltins: true
});

/**
 * TemplateDX instance dedicated to Language processing (text + object)
 * This instance can have specialized plugins and filters for text and object generation prompts
 */
export const languageTemplateDX = new TemplateDX({
  includeBuiltins: true
});

// Create plugin instances
const basicTagPlugin = new BasicTagPlugin();
const extractMediaPlugin = new ExtractMediaPlugin();
const extractTextPlugin = new ExtractTextPlugin();

// Register plugins on all three instances
const basicTags = ["s", "ForEach"]; // 's' is an alias for System

[imageTemplateDX, speechTemplateDX, languageTemplateDX].forEach((instance) => {
  // Register basic tags
  instance.registerTagPlugin(basicTagPlugin, basicTags);
  
  // Register media plugins
  instance.registerTagPlugin(extractMediaPlugin, [
    "ImageAttachment",
    "FileAttachment",
  ]);

  // Register text extraction plugins (including the alias 's')
  const textTags = [
    "s", // alias for System
    USER,
    SYSTEM,
    ASSISTANT,
    SPEECH_PROMPT,
    IMAGE_PROMPT,
  ];
  instance.registerTagPlugin(extractTextPlugin, textTags);
});

/**
 * Get the appropriate TemplateDX instance based on prompt type
 */
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

/**
 * Determine the prompt type based on the front matter configuration
 */
export function determinePromptType(frontMatter: any): 'image' | 'speech' | 'language' {
  if (frontMatter.image_config) {
    return 'image';
  }
  if (frontMatter.speech_config) {
    return 'speech';
  }
  // Both text_config and object_config are considered "language" type
  if (frontMatter.text_config || frontMatter.object_config) {
    return 'language';
  }
  
  // Default to language if no specific config is found
  return 'language';
}