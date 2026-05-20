<!--
  Auto-generated from oss/agentmark/packages/prompt-core/src/schemas.ts.
  Do not hand-edit. Run `yarn generate-skill-frontmatter-reference` to regenerate.
-->

# AgentMark prompt frontmatter — runtime schema

> Generated from `@agentmark-ai/prompt-core`'s Zod schemas. This is the **runtime truth** — the shape `loadTextPrompt` and friends actually parse. If [the published docs](https://docs.agentmark.co/build/syntax.md) disagree, prefer the docs and file an issue against `agentmark-ai/agentmark` noting the drift.

## Schema index

- [`ChatMessageSchema`](#chatmessageschema)
- [`textPartSchema`](#textpartschema)
- [`imagePartSchema`](#imagepartschema)
- [`filePartSchema`](#filepartschema)
- [`userMessagesSchema`](#usermessagesschema)
- [`assistantMessagesSchema`](#assistantmessagesschema)
- [`systemMessagesSchema`](#systemmessagesschema)
- [`TextSettingsConfig`](#textsettingsconfig)
- [`TestSettingsSchema`](#testsettingsschema)
- [`ObjectSettingsConfig`](#objectsettingsconfig)
- [`ImageSettingsConfig`](#imagesettingsconfig)
- [`SpeechSettingsConfig`](#speechsettingsconfig)
- [`TextConfigSchema`](#textconfigschema)
- [`ObjectConfigSchema`](#objectconfigschema)
- [`ImageConfigSchema`](#imageconfigschema)
- [`SpeechConfigSchema`](#speechconfigschema)

## `ChatMessageSchema`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `role` | `enum("system", "user", "assistant")` | ✓ |  |
| `content` | `string` | ✓ |  |

## `textPartSchema`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `type` | `z.literal("text")` | ✓ |  |
| `text` | `string` | ✓ |  |

## `imagePartSchema`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `type` | `z.literal("image")` | ✓ |  |
| `image` | `z.string().url()` | ✓ |  |
| `mimeType` | `string` |  |  |

## `filePartSchema`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `type` | `z.literal("file")` | ✓ |  |
| `data` | `z.string().url()` | ✓ |  |
| `mimeType` | `string` | ✓ |  |

## `userMessagesSchema`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `role` | `z.literal("user")` | ✓ |  |
| `content` | `z.union([ z.string(), z.array(z.union([textPartSchema, imagePartSchema, filePartSchema])), ])` | ✓ |  |

## `assistantMessagesSchema`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `role` | `z.literal("assistant")` | ✓ |  |
| `content` | `string` | ✓ |  |

## `systemMessagesSchema`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `role` | `z.literal("system")` | ✓ |  |
| `content` | `string` | ✓ |  |

## `TextSettingsConfig`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `model_name` | `string` | ✓ |  |
| `max_tokens` | `number` |  |  |
| `temperature` | `number` |  |  |
| `max_calls` | `number` |  |  |
| `top_p` | `number` |  |  |
| `top_k` | `number` |  |  |
| `presence_penalty` | `number` |  |  |
| `frequency_penalty` | `number` |  |  |
| `stop_sequences` | `string[]` |  |  |
| `seed` | `number` |  |  |
| `max_retries` | `number` |  |  |
| `tool_choice` | `z .union([ z.enum(["auto", "none", "required"]), z.object({ type: z.literal("tool"), tool_name: z.string(), }), ])` |  |  |
| `tools` | `string[]` |  |  |

## `TestSettingsSchema`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `props` | `Record<string, any>` |  |  |
| `dataset` | `string` |  |  |
| `evals` | `string[]` |  | Eval function names to run during experiments. |
| `regression_tolerance` | `number` |  | Maximum allowed drop in a scorer's score relative to its baseline before the case fails the regression gate. Expressed as a fraction (0.05 = 5%). Only fires when a baseline score is available for the row+scorer pair (i.e. when `agentmark run-experiment` was invoked with `--baseline-commit` and the baseline endpoint returned a score). When no baseline is available, this field has no effect and the case is gated only on its absolute pass/fail status. |

## `ObjectSettingsConfig`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `model_name` | `string` | ✓ |  |
| `max_tokens` | `number` |  |  |
| `temperature` | `number` |  |  |
| `max_calls` | `number` |  |  |
| `top_p` | `number` |  |  |
| `top_k` | `number` |  |  |
| `presence_penalty` | `number` |  |  |
| `frequency_penalty` | `number` |  |  |
| `stop_sequences` | `string[]` |  |  |
| `seed` | `number` |  |  |
| `max_retries` | `number` |  |  |
| `tools` | `string[]` |  |  |
| `schema` | `Record<string, any>` | ✓ |  |
| `schema_name` | `string` |  |  |
| `schema_description` | `string` |  |  |

## `ImageSettingsConfig`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `model_name` | `string` | ✓ |  |
| `prompt` | `string` | ✓ |  |
| `num_images` | `number` |  |  |
| `size` | `z .string() .regex(/^\\d+x\\d+$/)` |  |  |
| `aspect_ratio` | `z .string() .regex(/^\\d+:\\d+$/)` |  |  |
| `seed` | `number` |  |  |

## `SpeechSettingsConfig`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `model_name` | `string` | ✓ |  |
| `text` | `string` | ✓ |  |
| `voice` | `string` |  |  |
| `output_format` | `string` |  |  |
| `instructions` | `string` |  |  |
| `speed` | `number` |  |  |

## `TextConfigSchema`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `name` | `string` | ✓ |  |
| `messages` | `RichChatMessageSchema[]` | ✓ |  |
| `text_config` | `TextSettingsConfig` | ✓ |  |
| `test_settings` | `TestSettingsSchema` |  |  |
| `agentmark_meta` | `Record<string, any>` |  |  |

## `ObjectConfigSchema`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `name` | `string` | ✓ |  |
| `messages` | `RichChatMessageSchema[]` | ✓ |  |
| `object_config` | `ObjectSettingsConfig` | ✓ |  |
| `test_settings` | `TestSettingsSchema` |  |  |
| `agentmark_meta` | `Record<string, any>` |  |  |

## `ImageConfigSchema`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `name` | `string` | ✓ |  |
| `image_config` | `ImageSettingsConfig` | ✓ |  |
| `test_settings` | `TestSettingsSchema` |  |  |
| `agentmark_meta` | `Record<string, any>` |  |  |

## `SpeechConfigSchema`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `name` | `string` | ✓ |  |
| `speech_config` | `SpeechSettingsConfig` | ✓ |  |
| `test_settings` | `TestSettingsSchema` |  |  |
| `agentmark_meta` | `Record<string, any>` |  |  |
