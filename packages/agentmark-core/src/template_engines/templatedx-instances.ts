import { TemplateDX, TagPlugin, PluginContext } from "@agentmark/templatedx";
import type { Node } from "mdast";
import type { ImagePart, TextPart, FilePart } from "ai";

// Types for extracted content
type ExtractedField = {
  name: string;
  content: string | Array<TextPart | ImagePart | FilePart>;
};

// Constants
const USER = "User";
const SYSTEM = "System";
const ASSISTANT = "Assistant";
const SPEECH_PROMPT = "SpeechPrompt";
const IMAGE_PROMPT = "ImagePrompt";

/**
 * Simple text extraction plugin for basic tags (System, Assistant, ImagePrompt, SpeechPrompt)
 */
class SimpleTextPlugin extends TagPlugin {
  async transform(
    _props: Record<string, any>,
    children: Node[],
    pluginContext: PluginContext
  ): Promise<Node[]> {
    const { scope, tagName, createNodeTransformer, nodeHelpers } = pluginContext;

    if (!tagName) {
      throw new Error("tagName must be provided in pluginContext");
    }

    const promise = this.extractText(children, tagName, createNodeTransformer, nodeHelpers, scope);
    this.addPromiseToScope(promise, scope);
    
    return [];
  }

  private async extractText(
    children: Node[],
    tagName: string,
    createNodeTransformer: any,
    nodeHelpers: any,
    scope: any
  ): Promise<ExtractedField> {
    const transformer = createNodeTransformer(scope);
    const processedChildren = await Promise.all(
      children.map(async (child) => {
        const result = await transformer.transformNode(child);
        return Array.isArray(result) ? result : [result];
      })
    );

    const flattenedChildren = processedChildren.flat();
    const extractedText = nodeHelpers.toMarkdown({
      type: "root",
      children: flattenedChildren,
    });

    return {
      content: extractedText.trim(),
      name: tagName,
    };
  }

  private addPromiseToScope(promise: Promise<ExtractedField>, scope: any): void {
    const promises = scope.getShared("__agentmark-extractTextPromises");
    if (promises) {
      promises.push(promise);
    } else {
      scope.setShared("__agentmark-extractTextPromises", [promise]);
    }
  }
}

/**
 * User tag plugin - handles text extraction AND media attachment processing
 */
class UserPlugin extends TagPlugin {
  async transform(
    _props: Record<string, any>,
    children: Node[],
    pluginContext: PluginContext
  ): Promise<Node[]> {
    const { scope, createNodeTransformer, nodeHelpers } = pluginContext;

    // Set context for media attachments to know they're inside a User tag
    const childScope = scope.createChild();
    childScope.setShared("__insideMessageType", USER);

    const promise = this.extractUserContent(children, createNodeTransformer, nodeHelpers, childScope);
    this.addPromiseToScope(promise, scope);
    
    return [];
  }

  private async extractUserContent(
    children: Node[],
    createNodeTransformer: any,
    nodeHelpers: any,
    childScope: any
  ): Promise<ExtractedField> {
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
      children: flattenedChildren,
    });

    // Check if there are any media parts collected during processing
    const mediaParts = childScope.getShared("__agentmark-mediaParts") || [];
    const hasMediaContent = mediaParts.length > 0;
    
    const content = hasMediaContent
      ? [{ type: "text", text: extractedText.trim() }, ...mediaParts]
      : extractedText.trim();

    return {
      content,
      name: USER,
    };
  }

  private addPromiseToScope(promise: Promise<ExtractedField>, scope: any): void {
    const promises = scope.getShared("__agentmark-extractTextPromises");
    if (promises) {
      promises.push(promise);
    } else {
      scope.setShared("__agentmark-extractTextPromises", [promise]);
    }
  }
}

/**
 * Media attachment plugin for ImageAttachment and FileAttachment tags
 */
class MediaAttachmentPlugin extends TagPlugin {
  async transform(
    props: Record<string, any>,
    _children: Node[],
    pluginContext: PluginContext
  ): Promise<Node[]> {
    const { tagName, scope } = pluginContext;
    
    if (!tagName) {
      throw new Error("tagName must be provided in pluginContext");
    }

    // Verify we're inside a User tag
    const isInsideUser = scope.getShared("__insideMessageType");
    if (isInsideUser !== USER) {
      throw new Error("ImageAttachment and FileAttachment tags must be inside User tag.");
    }

    const mediaParts = scope.getShared("__agentmark-mediaParts") || [];
    
    if (tagName === "ImageAttachment") {
      this.processImageAttachment(props, mediaParts);
    } else if (tagName === "FileAttachment") {
      this.processFileAttachment(props, mediaParts);
    }
    
    scope.setShared("__agentmark-mediaParts", mediaParts);
    return [];
  }

  private processImageAttachment(props: Record<string, any>, mediaParts: any[]): void {
    const { image, mimeType } = props;

    if (image === undefined) {
      throw new Error("ImageAttachment must contain an image prop");
    }

    if (image) {
      mediaParts.push({
        type: "image",
        image,
        ...(mimeType && { mimeType }),
      });
    }
  }

  private processFileAttachment(props: Record<string, any>, mediaParts: any[]): void {
    const { data, mimeType } = props;
    
    if (data === undefined || mimeType === undefined) {
      throw new Error("FileAttachment must contain data and mimeType props");
    }
    
    if (data && mimeType) {
      mediaParts.push({ type: "file", data, mimeType });
    }
  }
}

// Create TemplateDX instances
export const imageTemplateDX = new TemplateDX();
export const speechTemplateDX = new TemplateDX();
export const languageTemplateDX = new TemplateDX();

// Create plugin instances
const simpleTextPlugin = new SimpleTextPlugin();
const userPlugin = new UserPlugin();
const mediaAttachmentPlugin = new MediaAttachmentPlugin();

// Register plugins on appropriate instances
imageTemplateDX.registerTagPlugin(simpleTextPlugin, [IMAGE_PROMPT]);
speechTemplateDX.registerTagPlugin(simpleTextPlugin, [SYSTEM, SPEECH_PROMPT]);
languageTemplateDX.registerTagPlugin(simpleTextPlugin, [SYSTEM, ASSISTANT]);
languageTemplateDX.registerTagPlugin(userPlugin, [USER]);
languageTemplateDX.registerTagPlugin(mediaAttachmentPlugin, ["ImageAttachment", "FileAttachment"]);

// Helper functions
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
  if (frontMatter.image_config) return 'image';
  if (frontMatter.speech_config) return 'speech';
  if (frontMatter.text_config || frontMatter.object_config) return 'language';
  return 'language';
}