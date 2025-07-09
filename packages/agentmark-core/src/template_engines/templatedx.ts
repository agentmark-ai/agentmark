import type { Ast } from "@agentmark/templatedx";
import type { TemplateEngine, JSONObject, TestSettings } from "../types";
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
import { 
  languageTemplateDX, 
  getTemplateDXInstance,
  determinePromptType 
} from "./templatedx-instances";

// Types for extracted content and shared context
type ExtractedField = {
  name: string;
  content: string | Array<TextPart | ImagePart | FilePart>;
};

type SharedContext = {
  "__agentmark-extractTextPromises"?: Promise<ExtractedField>[];
};

// Constants
const USER = "User";
const SYSTEM = "System";
const ASSISTANT = "Assistant";
const ROLETAGS = new Set([USER, SYSTEM, ASSISTANT]);
const SPEECH_PROMPT = "SpeechPrompt";
const IMAGE_PROMPT = "ImagePrompt";

// Template engine implementation
export class TemplateDXTemplateEngine implements TemplateEngine {
  async compile<
    R = AgentmarkConfig,
    P extends Record<string, any> = JSONObject
  >(options: { template: Ast; props?: P }): Promise<R> {
    return getRawConfig({ ...options, ast: options.template }) as R;
  }
}

// Helper function to convert extracted fields to chat messages
function getMessages({
  extractedFields,
  configType,
}: {
  extractedFields: ExtractedField[];
  configType: PromptKind;
}): RichChatMessage[] {
  const messages: RichChatMessage[] = [];
  
  extractedFields.forEach((field, index) => {
    const fieldName = field.name;
    
    // System message must be first if present
    if (index !== 0 && fieldName === SYSTEM) {
      throw new Error(`System message may only be the first message: ${field.content}`);
    }
    
    // Validate role tag
    if (!ROLETAGS.has(fieldName)) {
      throw new Error(`Invalid role tag:"${fieldName}" in config type: ${configType}.`);
    }

    // Create properly typed message based on role
    if (fieldName === "User") {
      messages.push({ 
        role: "user", 
        content: field.content as any // Type compatibility handled at runtime
      });
    } else if (fieldName === "Assistant") {
      messages.push({ 
        role: "assistant", 
        content: field.content as string 
      });
    } else if (fieldName === "System") {
      messages.push({ 
        role: "system", 
        content: field.content as string 
      });
    }
  });
  
  return messages;
}

// Validate prompt structure based on config type
function validatePrompts({
  extractedFields,
  configType,
}: {
  extractedFields: ExtractedField[];
  configType: PromptKind;
}): void {
  const tagNames = new Set(extractedFields.map((f) => f.name));
  const invalidTags = [ASSISTANT, USER];
  const hasSystem = tagNames.has(SYSTEM);
  const hasSpeechPrompt = tagNames.has(SPEECH_PROMPT);
  const hasImagePrompt = tagNames.has(IMAGE_PROMPT);
  const invalidTag = invalidTags.find((tag) => tagNames.has(tag));

  if (invalidTag) {
    throw new Error(`Invalid tag: ${invalidTag} found in config type: ${configType}.`);
  }

  if (configType === "speech" && !hasSpeechPrompt) {
    throw new Error(`'SpeechPrompt' tag not found for config type: ${configType}.`);
  }

  if (configType === "image" && !hasImagePrompt) {
    throw new Error(`'ImagePrompt' tag not found for config type: ${configType}.`);
  }
  
  if (hasSpeechPrompt && hasImagePrompt) {
    throw new Error(`SpeechPrompt and ImagePrompt tags cannot be used together.`);
  }
  
  if (hasImagePrompt && hasSystem) {
    throw new Error(`ImagePrompt and System tags cannot be used together.`);
  }
}

// Extract prompt content for image and speech configs
function getPrompt({
  tagName,
  extractedFields,
}: {
  tagName: typeof SPEECH_PROMPT | typeof IMAGE_PROMPT;
  extractedFields: ExtractedField[];
}): { prompt: string; instructions?: string } {
  if (tagName === SPEECH_PROMPT) {
    const speechField = extractedFields.find((field) => field.name === SPEECH_PROMPT);
    const systemField = extractedFields.find((field) => field.name === SYSTEM);

    return {
      prompt: (speechField?.content as string) ?? "",
      instructions: systemField?.content as string,
    };
  } 
  
  if (tagName === IMAGE_PROMPT) {
    const imageField = extractedFields.find((field) => field.name === IMAGE_PROMPT);
    return { prompt: (imageField?.content as string) ?? "" };
  }
  
  return { prompt: "" };
}

// Main configuration processing function
export async function getRawConfig({
  ast,
  props,
}: {
  ast: Ast;
  props?: JSONObject;
}): Promise<AgentmarkConfig> {
  // Get front matter and determine prompt type
  const frontMatter: any = languageTemplateDX.getFrontMatter(ast);
  const promptType = determinePromptType(frontMatter);
  
  // Get the appropriate TemplateDX instance and transform
  const templateDXInstance = getTemplateDXInstance(promptType);
  const shared: SharedContext = {};
  await templateDXInstance.transform(ast, props || {}, shared);
  
  // Extract all field promises and resolve them
  const extractedFieldPromises = shared["__agentmark-extractTextPromises"] || [];
  const extractedFields = await Promise.all(extractedFieldPromises);

  // Extract settings from front matter
  const name: string = frontMatter.name;
  const speechSettings: SpeechSettings | undefined = frontMatter.speech_config;
  const imageSettings: ImageSettings | undefined = frontMatter.image_config;
  const objectSettings: ObjectSettings | undefined = frontMatter.object_config;
  const textSettings: TextSettings | undefined = frontMatter.text_config;
  const testSettings: TestSettings | undefined = frontMatter.test_settings;

  // Determine config type from settings
  let configType: PromptKind | undefined;
  if (speechSettings) configType = "speech";
  else if (imageSettings) configType = "image";
  else if (objectSettings) configType = "object";
  else if (textSettings) configType = "text";

  // Process based on config type
  if (configType === "speech" || configType === "image") {
    validatePrompts({ extractedFields, configType });
    const { prompt, instructions } = getPrompt({
      tagName: configType === "speech" ? SPEECH_PROMPT : IMAGE_PROMPT,
      extractedFields,
    });

    if (configType === "speech" && speechSettings && prompt) {
      return {
        name,
        speech_config: {
          ...speechSettings,
          text: prompt,
          instructions: instructions ?? "",
        },
        test_settings: testSettings,
      };
    }
    
    if (configType === "image" && imageSettings && prompt) {
      return {
        name,
        image_config: {
          ...imageSettings,
          prompt: prompt,
        },
        test_settings: testSettings,
      };
    }
  } else if (configType === "object" || configType === "text") {
    const messages = getMessages({ extractedFields, configType });

    if (configType === "object" && objectSettings) {
      return {
        name,
        messages,
        object_config: objectSettings,
        test_settings: testSettings,
      };
    }
    
    if (configType === "text" && textSettings) {
      return {
        name,
        messages,
        text_config: textSettings,
        test_settings: testSettings,
      };
    }
  }

  throw new Error("No valid config found in frontmatter.");
}
