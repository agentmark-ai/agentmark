import { SpanData } from "@/sections/traces/types";

export interface AttributeTransformer {
  transform(
    attributes: Record<string, any>,
    normalizedData?: SpanData["data"]
  ): Record<string, any> | null;
}

interface RegisteredTransformer {
  transformer: AttributeTransformer;
  priority: number;
}

export class AttributeTransformerRegistry {
  private transformers: RegisteredTransformer[] = [];

  register(transformer: AttributeTransformer, priority: number = 0): void {
    this.transformers.push({ transformer, priority });
    this.transformers.sort((a, b) => b.priority - a.priority);
  }

  transform(
    attributes: Record<string, any>,
    normalizedData?: SpanData["data"]
  ): Record<string, any> {
    for (const { transformer } of this.transformers) {
      try {
        const result = transformer.transform(attributes, normalizedData);
        if (result !== null) {
          return result;
        }
      } catch (error) {
        console.warn("Transformer error:", error);
      }
    }

    return attributes;
  }
}

export const attributeTransformerRegistry = new AttributeTransformerRegistry();

