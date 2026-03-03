# 01 — Hello World

The simplest possible AgentMark prompt. One file, one command.

## The prompt

`hello.prompt.mdx` defines a text generation prompt with a single input variable:

```mdx
<System>You are a sharp, concise technical writer...</System>
<User>Give me your take on: {props.topic}</User>
```

The frontmatter specifies the model, test props, and input schema.

## Run it

```bash
# With test props (from frontmatter)
agentmark run-prompt agentmark/hello.prompt.mdx

# With custom props
agentmark run-prompt agentmark/hello.prompt.mdx --props '{"topic": "monorepos vs polyrepos"}'
```

## What to notice

- The prompt is just Markdown with `<System>` and `<User>` tags
- `{props.topic}` is a type-safe variable — the `input_schema` defines its type
- `test_settings.props` provides default values for quick testing
