---
'@agentmark-ai/ui-components': patch
---

Add a Variables panel to the trace Input/Output tab. When a generation span carries template variables (frontmatter props, `agentmark.props`), they now render as their own labeled "Variables" panel (raw JSON) above the rendered messages — the input section reads Variables → Messages → Output, each a distinct labeled section. Messages keep their existing Raw/Markdown format toggle. This surfaces the structured props a prompt was rendered with (useful for debugging a dataset/experiment row) alongside the rendered messages, mirroring how prompt-centric tracing (e.g. Phoenix) shows template variables in the trace view.

Also fixes the Storybook scss highlighter import to use the `refractor/scss` package specifier (refractor v5's `./*` export) instead of a hardcoded `node_modules` path that failed to resolve under the monorepo's hoisting and blocked story rendering.
