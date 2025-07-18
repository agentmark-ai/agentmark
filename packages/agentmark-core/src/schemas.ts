import { z } from "zod";

export const ChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const imagePartSchema = z.object({
  type: z.literal("image"),
  image: z.string().url(),
  mimeType: z.string().optional(),
});

export const filePartSchema = z.object({
  type: z.literal("file"),
  data: z.string().url(),
  mimeType: z.string(),
});

export const userMessagesSchema = z.object({
  role: z.literal("user"),
  content: z.union([
    z.string(),
    z.array(z.union([textPartSchema, imagePartSchema, filePartSchema])),
  ]),
});

export const assistantMessagesSchema = z.object({
  role: z.literal("assistant"),
  content: z.string(),
});

export const systemMessagesSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
});

export const RichChatMessageSchema = z.union([
  userMessagesSchema,
  assistantMessagesSchema,
  systemMessagesSchema,
]);

export type RichChatMessage = z.infer<typeof RichChatMessageSchema>;

export const TextSettingsConfig = z.object({
  model_name: z.string(),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  max_calls: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  presence_penalty: z.number().optional(),
  frequency_penalty: z.number().optional(),
  stop_sequences: z.array(z.string()).optional(),
  seed: z.number().optional(),
  max_retries: z.number().optional(),
  tool_choice: z
    .union([
      z.enum(["auto", "none", "required"]),
      z.object({
        type: z.literal("tool"),
        tool_name: z.string(),
      }),
    ])
    .optional(),
  tools: z
    .record(
      z.object({
        description: z.string(),
        parameters: z.record(z.any()),
      })
    )
    .optional(),
});

export type TextSettings = z.infer<typeof TextSettingsConfig>;

export const TestSettingsSchema = z.object({
  props: z.record(z.any()).nullable().optional(),
  dataset: z.string().optional(),
});

export type TestSettings = z.infer<typeof TestSettingsSchema>;

export const ObjectSettingsConfig = z.object({
  model_name: z.string(),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  max_calls: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  presence_penalty: z.number().optional(),
  frequency_penalty: z.number().optional(),
  stop_sequences: z.array(z.string()).optional(),
  seed: z.number().optional(),
  max_retries: z.number().optional(),
  schema: z.record(z.any()),
  schema_name: z.string().optional(),
  schema_description: z.string().optional(),
});

export type ObjectSettings = z.infer<typeof ObjectSettingsConfig>;

export const ImageSettingsConfig = z.object({
  model_name: z.string(),
  num_images: z.number().optional(),
  size: z
    .string()
    .regex(/^\d+x\d+$/)
    .optional(),
  aspect_ratio: z
    .string()
    .regex(/^\d+:\d+$/)
    .optional(),
  seed: z.number().optional(),
});

export type ImageSettings = z.infer<typeof ImageSettingsConfig>;

export const SpeechSettingsConfig = z.object({
  model_name: z.string(),
  voice: z.string().optional(),
  output_format: z.string().optional(),
  speed: z.number().optional(),
});

export type SpeechSettings = z.infer<typeof SpeechSettingsConfig>;

export const TextConfigSchema = z.object({
  name: z.string(),
  messages: z.array(RichChatMessageSchema),
  text_config: TextSettingsConfig,
  test_settings: TestSettingsSchema.optional(),
});

export type TextConfig = z.infer<typeof TextConfigSchema>;

export const ObjectConfigSchema = z.object({
  name: z.string(),
  messages: z.array(RichChatMessageSchema),
  object_config: ObjectSettingsConfig,
  test_settings: TestSettingsSchema.optional(),
});

export type ObjectConfig = z.infer<typeof ObjectConfigSchema>;

export const ImageConfigSchema = z.object({
  name: z.string(),
  image_config: ImageSettingsConfig,
  test_settings: TestSettingsSchema.optional(),
});

export type ImageConfig = z.infer<typeof ImageConfigSchema>;

export const SpeechConfigSchema = z.object({
  name: z.string(),
  speech_config: SpeechSettingsConfig,
  test_settings: TestSettingsSchema.optional(),
});

export type SpeechConfig = z.infer<typeof SpeechConfigSchema>;
