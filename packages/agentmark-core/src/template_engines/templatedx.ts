import { TagPluginRegistry, transform } from "@agentmark/templatedx";
import {
  TagPlugin,
  PluginContext,
  getFrontMatter,
} from "@agentmark/templatedx";
import type { Ast } from "@agentmark/templatedx";
import type { Node } from "mdast";
import type { TemplateEngine, JSONObject } from "../types";
import type { ImagePart, TextPart, FilePart } from "ai";
import type {
  PromptKind,
  ImageSettings,
  ObjectSettings,
  TextSettings,
  SpeechSettings,
  RichChatMessage,
  ChatMessage,
  AgentmarkConfig,
} from "../types";

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
const ROLETAGS = new Set([USER, SYSTEM, ASSISTANT]);

const SPEECH_PROMPT = "SpeechPrompt";
const IMAGE_PROMPT = "ImagePrompt";

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

        const mediaParts = scope.getShared("__puzzlet-mediaParts") || [];
        const hasMediaContent = tagName === USER && mediaParts.length;
        const content = hasMediaContent
          ? [{ type: "text", text: extractedText.trim() }, ...media]
          : extractedText.trim();

        resolve({
          content,
          name: tagName,
        });
      } catch (error) {
        reject(error);
      }
    });

    const media = scope.getShared("__puzzlet-mediaParts") || [];
    const promises = scope.getShared("__agentmark-extractTextPromises");
    if (!promises) {
      scope.setShared("__agentmark-extractTextPromises", [promise]);
    } else {
      promises.push(promise);
    }

    return [];
  }
}

export class ExtractMediaPlugin extends TagPlugin {
  private readonly key = "__puzzlet-mediaParts";
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

TagPluginRegistry.register(new ExtractMediaPlugin(), [
  "ImageAttachment",
  "FileAttachment",
]);

TagPluginRegistry.register(new ExtractTextPlugin(), [
  USER,
  SYSTEM,
  ASSISTANT,
  SPEECH_PROMPT,
  IMAGE_PROMPT,
]);

type CompiledConfig = {
  name: string;
  messages: ChatMessage[];
  image_config?: ImageSettings;
  object_config?: ObjectSettings;
  text_config?: TextSettings;
  speech_config?: SpeechSettings;
};

export class TemplateDXTemplateEngine implements TemplateEngine {
  async compile<
    R = CompiledConfig,
    P extends Record<string, any> = JSONObject
  >(options: {
    template: Ast;
    props?: P;
    configType?: PromptKind;
  }): Promise<R> {
    return getRawConfig({ ...options, ast: options.template }) as R;
  }
}

function getMessages({
  extractedFields,
  configType,
}: {
  extractedFields: Array<any>;
  configType?: PromptKind;
}): RichChatMessage[] {
  const messages: RichChatMessage[] = [];
  extractedFields.forEach((field, index) => {
    const fieldName = field.name;
    if (index !== 0 && fieldName === SYSTEM) {
      throw new Error(
        `System message may only be the first message: ${field.content}`
      );
    }
    if (!ROLETAGS.has(fieldName)) {
      throw new Error(
        `Invalid role tag:"${fieldName}" in config type: ${configType}.`
      );
    }

    const role = fieldName.toLocaleLowerCase();
    messages.push({ role, content: field.content });
  });
  return messages;
}

function validatePrompts({
  extractedFields,
  configType,
}: {
  extractedFields: ExtractedField[];
  configType?: PromptKind;
}) {
  const tagNames = new Set(extractedFields.map((f) => f.name));
  const invalidTags = [ASSISTANT, USER];

  const hasSystem = tagNames.has(SYSTEM);
  const hasSpeechPrompt = tagNames.has(SPEECH_PROMPT);
  const hasImagePrompt = tagNames.has(IMAGE_PROMPT);
  const invalidTag = invalidTags.find((tag) => tagNames.has(tag));

  if (invalidTag)
    throw new Error(
      `Invalid tag: ${invalidTag} found in config type: ${configType}.`
    );

  if (configType === "speech" && !hasSpeechPrompt) {
    throw new Error(
      `'SpeechPrompt' tag not found for config type: ${configType}.`
    );
  }

  if (configType === "image" && !hasImagePrompt) {
    throw new Error(
      `'ImagePrompt' tag not found for config type: ${configType}.`
    );
  }
  if (hasSpeechPrompt && hasImagePrompt)
    throw new Error(
      `SpeechPrompt and ImagePrompt tags cannot be used together.`
    );
  if (hasImagePrompt && hasSystem)
    throw new Error(`ImagePrompt and System tags cannot be used together.`);
}

function getPrompt({
  tagName,
  extractedFields,
}: {
  tagName: typeof SPEECH_PROMPT | typeof IMAGE_PROMPT;
  extractedFields: Array<ExtractedField>;
}): { prompt: string; instructions?: string } {
  switch (tagName) {
    case SPEECH_PROMPT:
      const speechField = extractedFields.find(
        (field) => field.name === SPEECH_PROMPT
      );
      const systemField = extractedFields.find(
        (field) => field.name === SYSTEM
      );

      return {
        prompt: (speechField?.content as string) ?? "",
        instructions: systemField?.content as string,
      };
    case IMAGE_PROMPT:
      const imageField = extractedFields.find(
        (field) => field.name === IMAGE_PROMPT
      );

      return { prompt: (imageField?.content as string) ?? "" };
    default:
      return { prompt: "" };
  }
}

export async function getRawConfig({
  ast,
  props,
  configType,
}: {
  ast: Ast;
  props?: JSONObject;
  configType?: PromptKind;
}): Promise<AgentmarkConfig> {
  const frontMatter: any = getFrontMatter(ast);
  const shared: SharedContext = {};
  await transform(ast, props || {}, shared);
  const extractedFieldPromises =
    shared["__agentmark-extractTextPromises"] || [];
  const extractedFields = await Promise.all(extractedFieldPromises);

  const name: string = frontMatter.name;

  let prompt: string | undefined;
  let instructions: string | undefined;
  let messages: RichChatMessage[] = [];
  if (configType === "speech" || configType === "image") {
    validatePrompts({ extractedFields, configType });
    ({ prompt, instructions } = getPrompt({
      tagName: configType === "speech" ? SPEECH_PROMPT : IMAGE_PROMPT,
      extractedFields,
    }));
  } else {
    messages = getMessages({ extractedFields, configType });
  }

  let speechSettings: SpeechSettings | undefined = frontMatter.speech_config;
  let imageSettings: ImageSettings | undefined = frontMatter.image_config;
  let objectSettings: ObjectSettings | undefined = frontMatter.object_config;
  let textSettings: TextSettings | undefined = frontMatter.text_config;

  switch (configType) {
    case "speech": {
      if (speechSettings && prompt) {
        return {
          name,
          speech_config: {
            ...speechSettings,
            text: prompt,
            instructions: instructions ?? "",
          },
        };
      }
      break;
    }
    case "image": {
      if (imageSettings && prompt) {
        return {
          name,
          image_config: {
            ...imageSettings,
            prompt: prompt,
          },
        };
      }
      break;
    }
    case "object": {
      if (objectSettings) {
        return {
          name,
          messages,
          object_config: objectSettings,
        };
      }
      break;
    }
    case "text":
    default: {
      if (textSettings) {
        return {
          name,
          messages,
          text_config: textSettings,
        };
      }
    }
  }

  throw new Error("No valid config found in frontmatter.");
}
