# 04 — Reusable Components

Import and compose prompt fragments across files.

## The prompt

`summarize-with-tone.prompt.mdx` imports a shared `tone-guidelines.mdx` component that defines writing style rules. The component receives `tone` as a prop and renders the appropriate guidelines.

This pattern lets you share system instructions, persona definitions, or formatting rules across many prompts without duplication.

## Files

- `summarize-with-tone.prompt.mdx` — The main prompt
- `components/tone-guidelines.mdx` — A reusable component with conditional logic

## Run it

```bash
agentmark run-prompt agentmark/summarize-with-tone.prompt.mdx

agentmark run-prompt agentmark/summarize-with-tone.prompt.mdx \
  --props '{"text": "AgentMark is an open-source platform...", "tone": "casual"}'
```

## What to notice

- `import ToneGuidelines from './components/tone-guidelines.mdx'` works like React imports
- Components receive props: `<ToneGuidelines tone={props.tone} />`
- Components can use `<If>` / `<Else>` for conditional content
- This keeps prompts DRY — change the tone guidelines once, every prompt updates
