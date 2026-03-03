# AgentMark Examples

Progressively complex examples showing what you can build with AgentMark.

| Example | What it demonstrates |
|---------|---------------------|
| [01-hello-world](./01-hello-world) | Simplest possible prompt — one file, one command |
| [02-structured-output](./02-structured-output) | Extract typed JSON with a schema |
| [03-tool-use](./03-tool-use) | Agent with tool calling and agentic loops |
| [04-reusable-components](./04-reusable-components) | Import and compose prompt fragments |
| [05-evaluations](./05-evaluations) | Test prompts against datasets with evals |
| [06-production-tracing](./06-production-tracing) | Trace LLM calls in production with the SDK |

## Prerequisites

1. Initialize an AgentMark project: `npm create agentmark@latest`
2. Start the dev server: `agentmark dev`
3. Copy any example's `.prompt.mdx` file into your project's `agentmark/` directory
4. Run it: `agentmark run-prompt agentmark/<filename>.prompt.mdx`
