# 03 — Tool Use

Build an agent that calls tools to answer questions.

## The prompt

`financial-assistant.prompt.mdx` defines an agent with two tools: `calculate` and `lookup_conversion_rate`. The `max_calls: 3` setting lets the agent make up to 3 tool calls before responding.

The frontmatter lists tool **names** — the schemas and handlers live in your code, wired up where you call the model (e.g. `agentmark.client.ts`).

## Run it

```bash
agentmark run-prompt agentmark/financial-assistant.prompt.mdx

agentmark run-prompt agentmark/financial-assistant.prompt.mdx \
  --props '{"question": "What is 15% tip on a $85 dinner bill?"}'
```

> **Note:** The CLI shows what tool calls the model wants to make; tool *execution* happens at your call site. To handle tool calls end-to-end, resolve each tool name to an implementation in your SDK call or executor — see [Tools and agents](https://docs.agentmark.co/build/tools-and-agents).

## What to notice

- The frontmatter declares which tools the prompt may call — your call site owns the implementations
- `max_calls` controls how many tool invocations the agent can make in a loop
- The neutral render surfaces the tool names in `text_config.tools`; your SDK or executor maps them to real functions
- The same prompt file works with any SDK (Vercel AI, Claude SDK, etc.) because tools resolve at the call site
