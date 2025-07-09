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
  >(options: { template: Ast; props?: P }): Promise<R> {
    return getRawConfig({ ...options, ast: options.template }) as R;
  }
}

function getMessages({
  extractedFields,
  configType,
}: {
  extractedFields: Array<any>;
  configType: PromptKind;
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
}: {
  ast: Ast;
  props?: JSONObject;
}): Promise<AgentmarkConfig> {
  const frontMatter: any = languageTemplateDX.getFrontMatter(ast);
  const promptType = determinePromptType(frontMatter);

  const templateDXInstance = getTemplateDXInstance(promptType);
  
  const shared: SharedContext = {};
  await templateDXInstance.transform(ast, props || {}, shared);
  const extractedFieldPromises =
    shared["__agentmark-extractTextPromises"] || [];
  const extractedFields = await Promise.all(extractedFieldPromises);

  const name: string = frontMatter.name;

  let configType: PromptKind | undefined = undefined;
  let prompt: string | undefined;
  let instructions: string | undefined;
  let messages: RichChatMessage[] = [];
  let speechSettings: SpeechSettings | undefined = frontMatter.speech_config;
  let imageSettings: ImageSettings | undefined = frontMatter.image_config;
  let objectSettings: ObjectSettings | undefined = frontMatter.object_config;
  let textSettings: TextSettings | undefined = frontMatter.text_config;
  let testSettings: TestSettings | undefined = frontMatter.test_settings;

  if (speechSettings) {
    configType = "speech";
  } else if (imageSettings) {
    configType = "image";
  } else if (objectSettings) {
    configType = "object";
  } else if (textSettings) {
    configType = "text";
  }

  if (configType === "speech" || configType === "image") {
    ({ prompt, instructions } = getPrompt({
      tagName: configType === "speech" ? SPEECH_PROMPT : IMAGE_PROMPT,
      extractedFields,
    }));
  } else if (configType === "object" || configType === "text") {
    messages = getMessages({ extractedFields, configType });
  }

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
          test_settings: testSettings,
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
          test_settings: testSettings,
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
          test_settings: frontMatter.test_settings,
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
          test_settings: frontMatter.test_settings,
        };
      }
    }
  }

  throw new Error("No valid config found in frontmatter.");
}
