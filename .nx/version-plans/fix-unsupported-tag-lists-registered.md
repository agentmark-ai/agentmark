---
'@agentmark-ai/templatedx': patch
---

The "Unsupported tag" error now lists the registered tags. Previously it said only "Unsupported tag '<X>'. Only native MDX elements, and registered tags are supported." — giving the author no hint about the valid options. An onboarding agent that wrote `<Human>{props.input}</Human>` (the message convention from other frameworks) instead of AgentMark's `<User>` got a dead-end error and couldn't self-correct, so the prompt failed to parse and the whole run broke. The message now appends "Registered tags: Assistant, …, System, User." (sorted), surfacing `<User>` as the fix for `<Human>`.
