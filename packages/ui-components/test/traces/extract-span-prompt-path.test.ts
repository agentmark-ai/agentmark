import { describe, it, expect } from "vitest";
import {
  extractSpanPromptPath,
  extractSpanCommitSha,
} from "@/sections/traces/utils/extract-span-data";

describe("extractSpanPromptPath", () => {
  it("returns the camelCase promptPath when present", () => {
    expect(
      extractSpanPromptPath({
        name: "invoke_agent",
        data: { promptPath: "support/triage.prompt.mdx" },
      })
    ).toBe("support/triage.prompt.mdx");
  });

  it("falls back to snake_case prompt_path (CH column form)", () => {
    expect(
      extractSpanPromptPath({
        name: "invoke_agent",
        data: { prompt_path: "sales/quote.prompt.mdx" },
      })
    ).toBe("sales/quote.prompt.mdx");
  });

  it("prefers camelCase over snake_case when both present", () => {
    expect(
      extractSpanPromptPath({
        name: "x",
        data: { promptPath: "primary.prompt.mdx", prompt_path: "fallback.prompt.mdx" },
      })
    ).toBe("primary.prompt.mdx");
  });

  it("falls back to the raw agentmark.prompt_path attribute (ClickHouse SpanAttributes form)", () => {
    expect(
      extractSpanPromptPath({
        name: "x",
        data: {
          attributes: JSON.stringify({
            "agentmark.prompt_path": "ops/runbook.prompt.mdx",
            "agentmark.prompt_name": "runbook",
          }),
        },
      })
    ).toBe("ops/runbook.prompt.mdx");
  });

  it("returns null when absent, empty, non-string, dataless, or for null/undefined spans", () => {
    expect(extractSpanPromptPath({ name: "x", data: {} })).toBeNull();
    expect(extractSpanPromptPath({ name: "x", data: { promptPath: "" } })).toBeNull();
    expect(extractSpanPromptPath({ data: { promptPath: 42 } as never })).toBeNull();
    expect(extractSpanPromptPath({ name: "x" })).toBeNull();
    expect(extractSpanPromptPath(null)).toBeNull();
    expect(extractSpanPromptPath(undefined)).toBeNull();
  });
});

describe("extractSpanCommitSha", () => {
  it("returns the camelCase commitSha when present", () => {
    expect(
      extractSpanCommitSha({ name: "x", data: { commitSha: "abc1234def" } })
    ).toBe("abc1234def");
  });

  it("falls back to snake_case commit_sha", () => {
    expect(
      extractSpanCommitSha({ name: "x", data: { commit_sha: "def5678abc" } })
    ).toBe("def5678abc");
  });

  it("falls back to the raw agentmark.metadata.commit_sha attribute", () => {
    expect(
      extractSpanCommitSha({
        name: "x",
        data: {
          attributes: JSON.stringify({ "agentmark.metadata.commit_sha": "deadbeef99" }),
        },
      })
    ).toBe("deadbeef99");
  });

  it("returns null when absent or for a null span", () => {
    expect(extractSpanCommitSha({ name: "x", data: {} })).toBeNull();
    expect(extractSpanCommitSha(null)).toBeNull();
  });
});
