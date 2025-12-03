import { SpanData } from "@/sections/traces/types";
import { attributeTransformerRegistry } from "./attribute-transformer-registry";
import { NormalizedTransformer } from "./transformers/normalized-transformer";
import { AiSdkTransformer } from "./transformers/ai-sdk-transformer";

attributeTransformerRegistry.register(new NormalizedTransformer(), 10);
attributeTransformerRegistry.register(new AiSdkTransformer(), 5);

export const transformAttributes = (
  attributes: Record<string, any>,
  normalizedData?: SpanData["data"]
): Record<string, any> => {
  try {
    return attributeTransformerRegistry.transform(attributes, normalizedData);
  } catch (_error) {
    return attributes;
  }
};

export { attributeTransformerRegistry };
