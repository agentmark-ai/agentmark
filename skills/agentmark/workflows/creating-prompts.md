# Creating prompts

A prompt is a `.prompt.mdx` file inside the **`agentmark/` directory**, which sits under the path named by `agentmarkPath` in `agentmark.json`. `agentmarkPath` names the folder *above* the prompt-root, **not** the prompt-root itself — the prompt-root resolves to `<agentmarkPath>/agentmark`. With the default `agentmarkPath: "."`, prompts live in **`agentmark/` at the repo root** (e.g. `agentmark/greeting.prompt.mdx`). A `.prompt.mdx` placed at the repo root next to `agentmark.json` is **not** discovered — see Common mistakes.

## Minimum viable prompt

A text-generation prompt, saved as **`agentmark/greeting.prompt.mdx`**. Note that `model_name` lives **inside** `text_config`, not at the top level:

```mdx
---
name: greeting
text_config:
  model_name: gpt-4o-mini
input_schema:
  type: object
  properties:
    name:
      type: string
  required: [name]
---

<System>You are a friendly greeter.</System>
<User>Greet {props.name}.</User>
```

The wrapper block (`text_config`, `object_config`, `image_config`, or `speech_config`) selects the generation type. **There is no top-level `model_name` field** — agents that put one at the top level produce prompts that fail to load.

## Frontmatter fields

The frontmatter is YAML. Required fields depend on the generation type. For the authoritative schema, generate it locally:

```bash
npx agentmark generate-schema
```

This writes `.agentmark/agentmark.schema.json`, which gives you IDE squiggles for `model_name`, schema fields, and provider options.

For the full frontmatter reference, fetch `https://docs.agentmark.co/build/syntax.md`.

## Generation types

AgentMark supports four generation types, selected by the frontmatter shape:

| Type | When to use | Docs |
|---|---|---|
| Text | Free-form completion | `https://docs.agentmark.co/build/generation-types/text.md` |
| Object | Structured JSON with schema validation | `https://docs.agentmark.co/build/generation-types/object.md` |
| Image | Image generation (DALL-E, Stable Diffusion) | `https://docs.agentmark.co/build/generation-types/image.md` |
| Speech | Text-to-speech | `https://docs.agentmark.co/build/generation-types/speech.md` |

WebFetch the relevant page before scaffolding the frontmatter — the required fields per type are not derivable from memory.

## Schema references

For reusable JSON schemas across prompts, use `$ref`:

```mdx
---
output_schema:
  $ref: "./schemas/customer.json"
---
```

See `https://docs.agentmark.co/build/schema-references.md` for the resolution rules.

## TemplateDX body syntax

The body uses TemplateDX — JSX-like tags inside markdown. Key tags:

- `<System>...</System>` — system message
- `<User>...</User>` — user message
- `<Assistant>...</Assistant>` — assistant message (for few-shot examples)
- `<ImageAttachment src={...} />` — attach an image
- `<FileAttachment src={...} />` — attach a file
- `{props.foo}` — interpolate input props

For the full syntax (loops, conditionals, components), fetch `https://docs.agentmark.co/build/syntax.md`.

## Running the prompt

```bash
# Run with inline props
npx agentmark run-prompt agentmark/greeting.prompt.mdx --props '{"name":"Alice"}'

# Run with props from a YAML or JSON file
npx agentmark run-prompt agentmark/greeting.prompt.mdx --props-file ./test-props.yaml
```

For local execution, ensure `npx agentmark dev` is running in another shell. `run-prompt` posts to the **webhook server** (default `http://localhost:9417`), not the API server on 9418. Override with `--server <url>` or `AGENTMARK_WEBHOOK_URL`.

## Generating types after authoring

After adding a prompt, regenerate types so the SDK has typed inputs and outputs:

```bash
npx agentmark generate-types --root-dir ./agentmark > agentmark.types.ts
```

For TypeScript projects this is required before the SDK's `loadTextPrompt('greeting')` will type-check.

## Common mistakes

- **Putting `model_name` at the top level of frontmatter** instead of inside `text_config` / `object_config` / `image_config` / `speech_config`. The schema rejects top-level `model_name`. Match the shape above.
- **Putting prompts at the repo root (or anywhere outside `agentmark/`)** — the prompt-root is `<agentmarkPath>/agentmark`, so the default `agentmarkPath: "."` means prompts go in `agentmark/`, *not* the repo root. A `.prompt.mdx` at the repo root is silently ignored: `agentmark dev` won't find it, and **a git deploy will report success while materializing zero templates** (`/v1/prompts?name=…` returns no paths). Always put prompts under `agentmark/`.
- **Using `"/"` as `agentmarkPath`** instead of `"."` — known footgun; use `"."`.
- **Hard-coding model IDs that don't exist** — run `npx agentmark pull-models` for a current list, or fetch `https://docs.agentmark.co/configure/client-config.md`. Real examples from the docs include `gpt-4o-mini`, `gpt-4o`, `claude-sonnet-4-20250514`. Do not invent versions.
- **Forgetting to regenerate types** after adding a prompt — TypeScript will not see the new prompt path until you re-run `generate-types`.
