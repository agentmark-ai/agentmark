import { describe, it, expect } from "vitest";
import {
  buildRunPromptCommand,
  singleQuoteShellEscape,
  RUN_PROMPT_PATH_PLACEHOLDER,
} from "@/sections/traces/components/build-cli-command";

describe("singleQuoteShellEscape", () => {
  it("wraps a simple string in single quotes", () => {
    expect(singleQuoteShellEscape("hello")).toBe("'hello'");
  });

  it("escapes embedded single quotes via close/escape/reopen", () => {
    expect(singleQuoteShellEscape("it's")).toBe("'it'\\''s'");
  });

  it("preserves double quotes, dollar signs, and backticks unchanged", () => {
    expect(singleQuoteShellEscape('say "$x" `cmd`')).toBe(`'say "$x" \`cmd\`'`);
  });

  it("preserves whitespace and newlines", () => {
    expect(singleQuoteShellEscape("a b\nc")).toBe("'a b\nc'");
  });

  it("preserves shell redirect chars when wrapped", () => {
    expect(singleQuoteShellEscape("a < b > c")).toBe("'a < b > c'");
  });

  it("handles empty strings", () => {
    expect(singleQuoteShellEscape("")).toBe("''");
  });
});

describe("buildRunPromptCommand", () => {
  it("emits the canonical command with quoted path and props", () => {
    const cmd = buildRunPromptCommand({
      filePath: "examples/hello.prompt.mdx",
      props: { topic: "ai" },
    });
    expect(cmd).toBe(
      `agentmark run-prompt 'examples/hello.prompt.mdx' --props '{"topic":"ai"}'`
    );
  });

  it("substitutes a placeholder when path is null", () => {
    const cmd = buildRunPromptCommand({ filePath: null, props: { x: 1 } });
    expect(cmd).toBe(
      `agentmark run-prompt '${RUN_PROMPT_PATH_PLACEHOLDER}' --props '{"x":1}'`
    );
  });

  it("substitutes a placeholder when path is an empty string", () => {
    const cmd = buildRunPromptCommand({ filePath: "", props: { x: 1 } });
    expect(cmd).toContain(RUN_PROMPT_PATH_PLACEHOLDER);
    // Placeholder must not contain `<` or `>` (shell redirect chars).
    expect(cmd).not.toContain("<");
    expect(cmd).not.toContain(">");
  });

  it("omits the --props flag when props are null", () => {
    const cmd = buildRunPromptCommand({
      filePath: "hello.prompt.mdx",
      props: null,
    });
    expect(cmd).toBe("agentmark run-prompt 'hello.prompt.mdx'");
  });

  it("omits the --props flag when props is an empty object", () => {
    const cmd = buildRunPromptCommand({
      filePath: "hello.prompt.mdx",
      props: {},
    });
    expect(cmd).toBe("agentmark run-prompt 'hello.prompt.mdx'");
  });

  it("escapes single quotes in string props", () => {
    const cmd = buildRunPromptCommand({
      filePath: "p.prompt.mdx",
      props: { greeting: "it's me" },
    });
    // JSON keeps `'` as-is. Shell single-quote escaping turns it into
    // `'\''` (close, escape, reopen).
    expect(cmd).toBe(
      `agentmark run-prompt 'p.prompt.mdx' --props '{"greeting":"it'\\''s me"}'`
    );
  });

  it("preserves nested objects and arrays via JSON", () => {
    const cmd = buildRunPromptCommand({
      filePath: "p.prompt.mdx",
      props: { tags: ["a", "b"], meta: { active: true } },
    });
    expect(cmd).toBe(
      `agentmark run-prompt 'p.prompt.mdx' --props '{"tags":["a","b"],"meta":{"active":true}}'`
    );
  });

  it("handles unicode in props without mangling", () => {
    const cmd = buildRunPromptCommand({
      filePath: "p.prompt.mdx",
      props: { city: "東京" },
    });
    expect(cmd).toBe(
      `agentmark run-prompt 'p.prompt.mdx' --props '{"city":"東京"}'`
    );
  });

  it("quotes paths containing spaces (legitimate on macOS/Windows)", () => {
    const cmd = buildRunPromptCommand({
      filePath: "examples/my prompts/hello.prompt.mdx",
      props: { topic: "ai" },
    });
    // The whole path must survive a copy-paste as a single argv[2].
    // Without quoting, bash would split on the space.
    expect(cmd).toBe(
      `agentmark run-prompt 'examples/my prompts/hello.prompt.mdx' --props '{"topic":"ai"}'`
    );
  });

  it("escapes single quotes inside file paths", () => {
    const cmd = buildRunPromptCommand({
      filePath: "examples/it's-mine.prompt.mdx",
      props: null,
    });
    expect(cmd).toBe(`agentmark run-prompt 'examples/it'\\''s-mine.prompt.mdx'`);
  });

  it("preserves backslashes inside paths (windows-style separators)", () => {
    // Backslashes are literal inside POSIX single quotes — no escape sequence
    // expansion. Users on bash who paste a Windows-style path won't get it
    // working anyway, but the command must at least not lose the slashes.
    const cmd = buildRunPromptCommand({
      filePath: "examples\\hello.prompt.mdx",
      props: null,
    });
    expect(cmd).toBe(`agentmark run-prompt 'examples\\hello.prompt.mdx'`);
  });

  it("safely handles paths with shell metachars (`<`, `>`, `|`, `;`)", () => {
    const cmd = buildRunPromptCommand({
      filePath: "weird;<name>.prompt.mdx",
      props: null,
    });
    // Without quoting, `<` would redirect stdin. With quoting it's literal.
    expect(cmd).toBe(`agentmark run-prompt 'weird;<name>.prompt.mdx'`);
  });
});
