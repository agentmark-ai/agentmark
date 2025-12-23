import type { Ast } from "@agentmark-ai/templatedx";
import type {
  TemplateEngine,
  JSONObject,
  TestSettings,
  PromptKind,
  ImageSettings,
  ObjectSettings,
  TextSettings,
  SpeechSettings,
  RichChatMessage,
  AgentmarkConfig,
  ImagePart,
  TextPart,
  FilePart,
} from "../types";
import { 
  languageTemplateDX, 
  getTemplateDXInstance,
  determinePromptType,
  USER,
  SYSTEM,
  ASSISTANT,
  SPEECH_PROMPT,
  IMAGE_PROMPT,
} from "./templatedx-instances";

type ExtractedField = {
  name: string;
  content: string | Array<TextPart | ImagePart | FilePart>;
};

type SharedContext = {
  "__agentmark-extractTextPromises"?: Promise<ExtractedField>[];
};

const ROLETAGS = new Set([USER, SYSTEM, ASSISTANT]);

export class TemplateDXTemplateEngine implements TemplateEngine {
  async compile<
    R = AgentmarkConfig,
    P extends Record<string, any> = JSONObject
  >(options: { template: Ast; props?: P }): Promise<R> {
    return getRawConfig({ ...options, ast: options.template }) as R;
  }
}

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
    
    if (index !== 0 && fieldName === SYSTEM) {
      throw new Error(`System message may only be the first message: ${field.content}`);
    }
    
    if (!ROLETAGS.has(fieldName)) {
      throw new Error(`Invalid role tag:"${fieldName}" in config type: ${configType}.`);
    }

    if (fieldName === USER) {
      messages.push({ 
        role: "user", 
        content: field.content as any
      });
    } else if (fieldName === ASSISTANT) {
      messages.push({ 
        role: "assistant", 
        content: field.content as string 
      });
    } else if (fieldName === SYSTEM) {
      messages.push({ 
        role: "system", 
        content: field.content as string 
      });
    }
  });
  
  return messages;
}

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
  
  const extractedFieldPromises = shared["__agentmark-extractTextPromises"] || [];
  const extractedFields = await Promise.all(extractedFieldPromises);

  const name: string = frontMatter.name;
  const speechSettings: SpeechSettings | undefined = frontMatter.speech_config;
  const imageSettings: ImageSettings | undefined = frontMatter.image_config;
  const objectSettings: ObjectSettings | undefined = frontMatter.object_config;
  const textSettings: TextSettings | undefined = frontMatter.text_config;
  const testSettings: TestSettings | undefined = frontMatter.test_settings;
  const agentmarkMeta: Record<string, any> | undefined = frontMatter.agentmark_meta;

  let configType: PromptKind | undefined;
  if (speechSettings) configType = "speech";
  else if (imageSettings) configType = "image";
  else if (objectSettings) configType = "object";
  else if (textSettings) configType = "text";

  if (configType === "speech" || configType === "image") {
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
        ...(agentmarkMeta && { agentmark_meta: agentmarkMeta }),
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
        ...(agentmarkMeta && { agentmark_meta: agentmarkMeta }),
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
        ...(agentmarkMeta && { agentmark_meta: agentmarkMeta }),
      };
    }
    
    if (configType === "text" && textSettings) {
      return {
        name,
        messages,
        text_config: textSettings,
        test_settings: testSettings,
        ...(agentmarkMeta && { agentmark_meta: agentmarkMeta }),
      };
    }
  }

  throw new Error("No valid config found in frontmatter.");
}
