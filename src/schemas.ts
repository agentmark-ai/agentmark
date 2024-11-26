import { z } from "zod";

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

const PromptDXBaseSettingsSchema = z.object({
  stream: z.boolean().optional(),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  presence_penalty: z.number().optional(),
  frequency_penalty: z.number().optional(),
  stop_sequences: z.array(z.string()).optional(),
  seed: z.number().optional(),
  max_retries: z.number().optional(),
  headers: z.record(z.string()).optional(),
});

export const PromptDXTextSettingsSchema = PromptDXBaseSettingsSchema.extend({
  tools: z
    .record(
      z.object({
        description: z.string(),
        parameters: z.unknown(),
      })
    )
    .optional(),
});

export const PromptDXSchemaSettingsSchema = PromptDXBaseSettingsSchema.extend({
  schema: z.unknown(),
});

export const PromptDXSettingsSchema = PromptDXBaseSettingsSchema.extend({
  schema: z.unknown().optional(),
  tools: z
    .record(
      z.object({
        description: z.string(),
        parameters: z.unknown(),
      })
    )
    .optional(),
}).refine((data) => ('schema' in data ? !('tools' in data) : true), {
  message: "'schema' cannot coexist with 'tools'.",
});

const MetadataSchema = z.object({
  model: z.object({
    name: z.string(),
    settings: PromptDXSettingsSchema,
  }),
});

export const PromptDXSchema = z.object({
  name: z.string(),
  messages: z.array(ChatMessageSchema),
  metadata: MetadataSchema,
});

