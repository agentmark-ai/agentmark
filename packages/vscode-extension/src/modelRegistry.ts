import { VercelModelRegistry } from "@puzzlet/agentmark";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

export const modelRegistry = new VercelModelRegistry();
modelRegistry.registerModel([
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "o1-mini",
  "o1-preview",
  "gpt-3.5-turbo",
], (name: string, options) => {
  const provider = createOpenAI(options); 
  return provider(name); 
}, "openai");

modelRegistry.registerModel(['dall-e-3', 'dall-e-2'], 
  (name: string, options) => {
    const provider = createOpenAI(options);
    return provider.image(name);
  }, "openai");

modelRegistry.registerModel([
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307"
  ], (name: string, options) => {
    const provider = createAnthropic(options);
    return provider(name);
  }, "anthropic");

export type modelConfig = 'image_config' | 'object_config' | 'text_config'