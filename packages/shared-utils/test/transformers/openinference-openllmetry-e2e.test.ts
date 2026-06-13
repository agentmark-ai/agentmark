import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { normalizeOtlpSpans } from "../../src/normalizer";
import { SpanType } from "../../src/normalizer/types";
import type { OtlpResourceSpans } from "../../src/normalizer/converters/otlp-converter";

const load = (...segments: string[]): OtlpResourceSpans[] =>
  (
    JSON.parse(readFileSync(join(__dirname, "..", "mocks", ...segments), "utf-8")) as {
      resourceSpans: OtlpResourceSpans[];
    }
  ).resourceSpans;

const openinferenceLangchain = load("openinference", "otlp-langchain-llm.json");
const openllmetryOpenai = load("openllmetry", "otlp-openai-llm.json");

// End-to-end: a real-shaped OTLP payload whose instrumentation scope is NOT
// registered ("openinference.instrumentation.langchain" /
// "opentelemetry.instrumentation.openai.v1") must flow through the default
// dispatching transformer, get routed by attribute signature, and emerge fully
// extracted — model, tokens, IO, semanticKind and span type all populated. This
// is the path that was previously dropping IO/model/tokens on the floor.

describe("normalizeOtlpSpans — OpenInference (unregistered scope, signature-routed)", () => {
  it("extracts a LangChain ChatOpenAI LLM span end-to-end", () => {
    const [span] = normalizeOtlpSpans(openinferenceLangchain as any);

    expect(span.type).toBe(SpanType.GENERATION);
    expect(span.semanticKind).toBe("llm");
    expect(span.model).toBe("gpt-4o");
    expect(span.inputTokens).toBe(11);
    expect(span.outputTokens).toBe(5);
    expect(span.totalTokens).toBe(16);
    expect(span.settings).toEqual({ temperature: 0, maxTokens: 512 });
    expect(span.input).toEqual([
      { role: "system", content: "You are a geography expert." },
      { role: "user", content: "What is the capital of France?" },
    ]);
    expect(span.output).toBe("The capital of France is Paris.");
    expect(span.sessionId).toBe("session-abc");
    expect(span.statusCode).toBe("1");
    expect(span.serviceName).toBe("my-rag-app");
  });
});

describe("normalizeOtlpSpans — OpenLLMetry (unregistered scope, signature-routed)", () => {
  it("extracts an OpenAI chat span end-to-end", () => {
    const [span] = normalizeOtlpSpans(openllmetryOpenai as any);

    expect(span.type).toBe(SpanType.GENERATION);
    expect(span.semanticKind).toBe("llm");
    expect(span.model).toBe("gpt-4o-mini-2024-07-18");
    expect(span.inputTokens).toBe(18);
    expect(span.outputTokens).toBe(9);
    expect(span.totalTokens).toBe(27);
    expect(span.settings).toEqual({ temperature: 0.7 });
    expect(span.finishReason).toBe("stop");
    expect(span.input).toEqual([
      { role: "system", content: "You are concise." },
      { role: "user", content: "Say hi in one word." },
    ]);
    expect(span.output).toBe("Hi");
    expect(span.userId).toBe("user-77");
    expect(span.statusCode).toBe("1");
  });
});
