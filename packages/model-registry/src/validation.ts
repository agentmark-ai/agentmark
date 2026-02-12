import { z } from "zod";

const modelModeSchema = z.enum([
  "chat",
  "embedding",
  "image_generation",
  "audio_speech",
  "audio_transcription",
  "moderation",
  "rerank",
]);

const modelPricingSchema = z
  .object({
    inputCostPerToken: z.number(),
    outputCostPerToken: z.number(),
    cacheCreationCostPerToken: z.number().optional(),
    cacheReadCostPerToken: z.number().optional(),
  })
  .strict();

const modelContextSchema = z
  .object({
    maxInputTokens: z.number().positive().optional(),
    maxOutputTokens: z.number().positive().optional(),
  })
  .strict()
  .refine(
    (ctx) => {
      if (
        ctx.maxInputTokens !== undefined &&
        ctx.maxOutputTokens !== undefined
      ) {
        return ctx.maxOutputTokens <= ctx.maxInputTokens;
      }
      return true;
    },
    {
      message: "maxOutputTokens must be <= maxInputTokens",
    }
  );

const modelCapabilitiesSchema = z
  .object({
    vision: z.boolean().optional(),
    functionCalling: z.boolean().optional(),
    parallelFunctionCalling: z.boolean().optional(),
    structuredOutput: z.boolean().optional(),
    promptCaching: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    audioInput: z.boolean().optional(),
    audioOutput: z.boolean().optional(),
    pdfInput: z.boolean().optional(),
    webSearch: z.boolean().optional(),
  })
  .strict();

const isoDatePattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/;

const modelEntryWithoutIdSchema = z.object({
  provider: z.string().min(1),
  displayName: z.string().min(1),
  mode: modelModeSchema,
  pricing: modelPricingSchema.optional(),
  context: modelContextSchema.optional(),
  capabilities: modelCapabilitiesSchema.optional(),
  deprecationDate: z
    .string()
    .regex(isoDatePattern, "Must be a valid ISO 8601 date")
    .nullable()
    .optional(),
  source: z.string().optional(),
  supportedParameters: z.array(z.string()).optional(),
});

const sourceInfoSchema = z.object({
  fetchedAt: z.string(),
  modelCount: z.number(),
});

export const modelsFileSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().min(1),
  generatedAt: z.string().min(1),
  sources: z.record(z.string(), sourceInfoSchema),
  models: z.record(z.string(), modelEntryWithoutIdSchema),
});

const partialModelEntrySchema = z.object({
  provider: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  mode: modelModeSchema.optional(),
  pricing: modelPricingSchema.optional(),
  context: modelContextSchema.optional(),
  capabilities: modelCapabilitiesSchema.optional(),
  deprecationDate: z
    .string()
    .regex(isoDatePattern, "Must be a valid ISO 8601 date")
    .nullable()
    .optional(),
  source: z.string().optional(),
  supportedParameters: z.array(z.string()).optional(),
});

export const overridesFileSchema = z.object({
  $schema: z.string().optional(),
  models: z.record(z.string(), partialModelEntrySchema),
});
