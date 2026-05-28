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

export type TextPart = z.infer<typeof textPartSchema>;

export const imagePartSchema = z.object({
  type: z.literal("image"),
  image: z.string().url(),
  mimeType: z.string().optional(),
});

export type ImagePart = z.infer<typeof imagePartSchema>;

export const filePartSchema = z.object({
  type: z.literal("file"),
  data: z.string().url(),
  mimeType: z.string(),
});

export type FilePart = z.infer<typeof filePartSchema>;

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
  tools: z.array(z.string()).optional(),
});

export type TextSettings = z.infer<typeof TextSettingsConfig>;

export const TestSettingsSchema = z.object({
  props: z.record(z.string(), z.any()).nullable().optional(),
  dataset: z.string().optional(),
  /** Eval function names to run during experiments. */
  evals: z.array(z.string()).optional(),
  /**
   * Stable, composition-agnostic identity of this evaluation — the key the
   * regression gate uses to match a run against its baseline across commits.
   * Independent of whether the subject is a single prompt, a workflow, an
   * agent, or a multi-agent system (think "test name", not "prompt name").
   *
   * Defaults to the repo-relative entrypoint path the experiment was run
   * against (e.g. `./prompts/qa.prompt.mdx`). Set this explicitly for
   * code-assembled targets with no single entrypoint file, or to keep the
   * identity stable across file renames.
   */
  experiment_key: z.string().optional(),
  /**
   * Maximum allowed drop in a scorer's score relative to its baseline before
   * the case fails the regression gate. Expressed as a fraction (0.05 = 5%).
   *
   * Only fires when a baseline score is available for the row+scorer pair
   * (i.e. when `agentmark run-experiment` was invoked with `--baseline-commit`
   * and the baseline endpoint returned a score). When no baseline is
   * available, this field has no effect and the case is gated only on its
   * absolute pass/fail status.
   */
  regression_tolerance: z.number().min(0).max(1).optional(),
  /**
   * Minimum acceptable **mean score** per scorer across the whole run, keyed
   * by scorer name (e.g. `{ groundedness: 0.9 }`). After a run completes, the
   * mean of each listed scorer's numeric scores is compared against its
   * threshold; falling below fails the run.
   *
   * This is a run-level aggregate gate — distinct from the per-row absolute
   * gate (`passed === false`) and the per-row regression gate
   * (`regression_tolerance`). It is the declarative equivalent of a
   * run-level evaluator assertion in code-first eval frameworks.
   */
  score_thresholds: z.record(z.string(), z.number().min(0).max(1)).optional(),
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
  tools: z.array(z.string()).optional(),
  schema: z.record(z.string(), z.any()),
  schema_name: z.string().optional(),
  schema_description: z.string().optional(),
});

export type ObjectSettings = z.infer<typeof ObjectSettingsConfig>;

export const ImageSettingsConfig = z.object({
  model_name: z.string(),
  prompt: z.string(),
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
  text: z.string(),
  voice: z.string().optional(),
  output_format: z.string().optional(),
  instructions: z.string().optional(),
  speed: z.number().optional(),
});

export type SpeechSettings = z.infer<typeof SpeechSettingsConfig>;

export const TextConfigSchema = z.object({
  name: z.string(),
  messages: z.array(RichChatMessageSchema),
  text_config: TextSettingsConfig,
  test_settings: TestSettingsSchema.optional(),
  agentmark_meta: z.record(z.string(), z.any()).optional(),
});

export type TextConfig = z.infer<typeof TextConfigSchema>;

export const ObjectConfigSchema = z.object({
  name: z.string(),
  messages: z.array(RichChatMessageSchema),
  object_config: ObjectSettingsConfig,
  test_settings: TestSettingsSchema.optional(),
  agentmark_meta: z.record(z.string(), z.any()).optional(),
});

export type ObjectConfig = z.infer<typeof ObjectConfigSchema>;

export const ImageConfigSchema = z.object({
  name: z.string(),
  image_config: ImageSettingsConfig,
  test_settings: TestSettingsSchema.optional(),
  agentmark_meta: z.record(z.string(), z.any()).optional(),
});

export type ImageConfig = z.infer<typeof ImageConfigSchema>;

export const SpeechConfigSchema = z.object({
  name: z.string(),
  speech_config: SpeechSettingsConfig,
  test_settings: TestSettingsSchema.optional(),
  agentmark_meta: z.record(z.string(), z.any()).optional(),
});

export type SpeechConfig = z.infer<typeof SpeechConfigSchema>;
