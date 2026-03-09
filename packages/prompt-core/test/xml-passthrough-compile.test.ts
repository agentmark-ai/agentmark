import { describe, it, expect } from "vitest";
import { getRawConfig } from "../src/template_engines/templatedx.js";
import { languageTemplateDX } from "../src/template_engines/templatedx-instances.js";

const contentLoader = async () => "";

/**
 * Helper: parse an MDX string through the full prompt-core compile pipeline.
 * Returns the compiled AgentmarkConfig with messages array.
 */
async function compilePrompt(mdx: string, props?: Record<string, any>) {
  const ast = await languageTemplateDX.parse(mdx, __dirname, contentLoader);
  return getRawConfig({ ast, props });
}

// ---------------------------------------------------------------------------
// Full prompt-core compile pipeline: XML tag passthrough in compiled output
// ---------------------------------------------------------------------------
// These tests prove that lowercase XML tags (used for prompt engineering)
// survive the entire compile pipeline and appear unescaped in the final
// messages[n].content string that would be sent to an LLM.
// ---------------------------------------------------------------------------

describe("Full prompt-core compile pipeline: XML passthrough", () => {
  it("should preserve basic XML tag in User message content", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<User>
Here are some examples:
<examples>My examples</examples>
</User>`;

    const config = await compilePrompt(mdx);

    expect(config.messages).toHaveLength(1);
    expect(config.messages![0].role).toBe("user");

    const content = config.messages![0].content as string;
    expect(content).toContain("<examples>My examples</examples>");
    // Must NOT be escaped
    expect(content).not.toContain("\\<examples>");
    expect(content).not.toContain("&lt;examples&gt;");
  });

  it("should preserve nested XML tags in compiled output", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<User>
<examples>
<example>First example</example>
<example>Second example</example>
</examples>
</User>`;

    const config = await compilePrompt(mdx);
    const content = config.messages![0].content as string;

    expect(content).toContain("<examples>");
    expect(content).toContain("</examples>");
    expect(content).toContain("<example>First example</example>");
    expect(content).toContain("<example>Second example</example>");
  });

  it("should preserve XML tag attributes in compiled output", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<User>
<context type="system">Important context</context>
</User>`;

    const config = await compilePrompt(mdx);
    const content = config.messages![0].content as string;

    expect(content).toContain('<context type="system">Important context</context>');
  });

  it("should preserve XML tags in System message content", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<System>
<instructions>Be helpful</instructions>
</System>

<User>
Hello
</User>`;

    const config = await compilePrompt(mdx);

    expect(config.messages).toHaveLength(2);
    expect(config.messages![0].role).toBe("system");
    expect(config.messages![1].role).toBe("user");

    const systemContent = config.messages![0].content as string;
    expect(systemContent).toContain("<instructions>Be helpful</instructions>");
  });

  it("should preserve multiple XML tags in sequence", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<User>
<context>Background info</context>

<examples>Example data</examples>

<instructions>Do the thing</instructions>
</User>`;

    const config = await compilePrompt(mdx);
    const content = config.messages![0].content as string;

    expect(content).toContain("<context>Background info</context>");
    expect(content).toContain("<examples>Example data</examples>");
    expect(content).toContain("<instructions>Do the thing</instructions>");

    // Verify ordering: context before examples before instructions
    const contextIdx = content.indexOf("<context>");
    const examplesIdx = content.indexOf("<examples>");
    const instructionsIdx = content.indexOf("<instructions>");
    expect(contextIdx).toBeLessThan(examplesIdx);
    expect(examplesIdx).toBeLessThan(instructionsIdx);
  });

  it("should evaluate template expressions AND preserve surrounding XML tags", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<User>
<examples>{props.examples}</examples>
</User>`;

    const config = await compilePrompt(mdx, { examples: "Here is example A" });
    const content = config.messages![0].content as string;

    expect(content).toContain("<examples>");
    expect(content).toContain("</examples>");
    expect(content).toContain("Here is example A");
    expect(content).not.toContain("{props.examples}");
  });

  it("should preserve XML tags with markdown content inside", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<User>
<instructions>
Follow these **rules**:

1. Be helpful
2. Be concise
</instructions>
</User>`;

    const config = await compilePrompt(mdx);
    const content = config.messages![0].content as string;

    expect(content).toContain("<instructions>");
    expect(content).toContain("</instructions>");
    expect(content).toContain("Be helpful");
    expect(content).toContain("Be concise");
  });

  it("should preserve common prompt engineering tags in compiled output", async () => {
    const tags = [
      "examples",
      "context",
      "instructions",
      "rules",
      "thinking",
      "scratchpad",
      "constraints",
      "persona",
    ];

    for (const tag of tags) {
      const mdx = `---
name: test-${tag}
text_config:
  model_name: test-model
---

<User>
<${tag}>Content for ${tag}</${tag}>
</User>`;

      const config = await compilePrompt(mdx);
      const content = config.messages![0].content as string;

      expect(content).toContain(`<${tag}>Content for ${tag}</${tag}>`);
    }
  });

  it("should produce correct config structure with name and text_config", async () => {
    const mdx = `---
name: my-prompt
text_config:
  model_name: gpt-4
---

<User>
<examples>test</examples>
</User>`;

    const config = await compilePrompt(mdx);

    expect(config.name).toBe("my-prompt");
    expect(config.text_config).toBeDefined();
    expect(config.text_config!.model_name).toBe("gpt-4");
    expect(config.messages).toHaveLength(1);
  });

  it("should preserve XML tags in Assistant message content", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<User>
Ask me anything
</User>

<Assistant>
<thinking>Let me consider this carefully</thinking>
Here is my answer.
</Assistant>`;

    const config = await compilePrompt(mdx);

    expect(config.messages).toHaveLength(2);
    expect(config.messages![1].role).toBe("assistant");

    const assistantContent = config.messages![1].content as string;
    expect(assistantContent).toContain("<thinking>Let me consider this carefully</thinking>");
    expect(assistantContent).toContain("Here is my answer.");
  });

  it("should preserve self-closing XML tags in compiled output", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<User>
Before the break
<separator />
After the break
</User>`;

    const config = await compilePrompt(mdx);
    const content = config.messages![0].content as string;

    expect(content).toContain("Before the break");
    expect(content).toContain("After the break");
    // Self-closing tags may serialize as <separator /> or <separator/>
    expect(content).toMatch(/<separator\s*\/>/);
  });

  it("should preserve deeply nested XML structure in compiled output", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<User>
<instructions>
<context>
<rules>Be helpful and concise</rules>
</context>
</instructions>
</User>`;

    const config = await compilePrompt(mdx);
    const content = config.messages![0].content as string;

    expect(content).toContain("<instructions>");
    expect(content).toContain("<context>");
    expect(content).toContain("<rules>Be helpful and concise</rules>");
    expect(content).toContain("</context>");
    expect(content).toContain("</instructions>");
  });
});

// ---------------------------------------------------------------------------
// Exact content snapshot tests
// ---------------------------------------------------------------------------
// These use exact string matching to catch any whitespace or escaping issues.
// ---------------------------------------------------------------------------

describe("Exact content snapshot: XML passthrough", () => {
  it("should produce exact expected content for simple XML in User message", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<User>
<examples>My examples</examples>
</User>`;

    const config = await compilePrompt(mdx);
    const content = config.messages![0].content as string;

    // Exact match — catches whitespace, escaping, or formatting regressions
    expect(content).toBe("<examples>My examples</examples>");
  });

  it("should produce exact expected content for System message with XML", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<System>
<instructions>Be helpful</instructions>
</System>

<User>
Hello
</User>`;

    const config = await compilePrompt(mdx);
    const systemContent = config.messages![0].content as string;
    const userContent = config.messages![1].content as string;

    expect(systemContent).toBe("<instructions>Be helpful</instructions>");
    expect(userContent).toBe("Hello");
  });

  it("should produce exact expected content for XML with attributes", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<User>
<context type="system">Important</context>
</User>`;

    const config = await compilePrompt(mdx);
    const content = config.messages![0].content as string;

    expect(content).toBe('<context type="system">Important</context>');
  });

  it("should produce exact expected content with template expression", async () => {
    const mdx = `---
name: test
text_config:
  model_name: test-model
---

<User>
<examples>{props.data}</examples>
</User>`;

    const config = await compilePrompt(mdx, { data: "Sample data" });
    const content = config.messages![0].content as string;

    // Expression content is rendered as a child node with surrounding whitespace
    expect(content).toBe("<examples>\n  Sample data\n</examples>");
  });
});
