# 03 — Tool Use

Build an agent that calls tools to answer questions.

## The prompt

`financial-assistant.prompt.mdx` defines an agent with two tools: `calculate` and `lookup_conversion_rate`. The `max_calls: 3` setting lets the agent make up to 3 tool calls before responding.

Tools are defined inline in the frontmatter with JSON Schema parameters — no separate registration needed.

## Run it

```bash
agentmark run-prompt agentmark/financial-assistant.prompt.mdx

agentmark run-prompt agentmark/financial-assistant.prompt.mdx \
  --props '{"question": "What is 15% tip on a $85 dinner bill?"}'
```

> **Note:** When running via the CLI, tool definitions are included in the formatted prompt but tool *execution* requires a tool registry in your `agentmark.client.ts`. The CLI shows what tool calls the model wants to make. To handle tool calls end-to-end, use an adapter with a tool registry — see [the docs](https://docs.agentmark.co/agentmark/prompt_basics/tools-and-agents).

## What to notice

- Tools are defined in the frontmatter — no separate file or registration needed
- `max_calls` controls how many tool invocations the agent can make in a loop
- The adapter translates tools into the format your SDK expects (Vercel AI, Claude SDK, etc.)
- Tool parameters use standard JSON Schema — the same schema you'd write for an API
