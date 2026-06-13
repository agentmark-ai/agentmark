import { describe, it, expect } from "vitest";
import { DispatchingTransformer } from "../../src/normalizer/transformers/dispatching";
import { OpenInferenceTransformer } from "../../src/normalizer/transformers/openinference";
import { OpenLLMetryTransformer } from "../../src/normalizer/transformers/openllmetry";
import { OtelGenAiTransformer } from "../../src/normalizer/transformers/otel-genai";
import { SpanType } from "../../src/normalizer/types";

const d = new DispatchingTransformer();
const span = (name: string): any => ({
  traceId: "t",
  spanId: "s",
  name,
  kind: 1,
  startTimeUnixNano: "0",
  endTimeUnixNano: "1",
});

describe("DispatchingTransformer.select — routing by attribute signature", () => {
  it("routes openinference.span.kind to the OpenInference transformer", () => {
    expect(d.select({ "openinference.span.kind": "LLM" })).toBeInstanceOf(OpenInferenceTransformer);
  });
  it("routes a bare llm.model_name to OpenInference", () => {
    expect(d.select({ "llm.model_name": "gpt-4o" })).toBeInstanceOf(OpenInferenceTransformer);
  });
  it("routes indexed llm.input_messages to OpenInference", () => {
    expect(d.select({ "llm.input_messages.0.message.role": "user" })).toBeInstanceOf(
      OpenInferenceTransformer
    );
  });
  it("routes any traceloop.* attribute to OpenLLMetry", () => {
    expect(d.select({ "traceloop.span.kind": "LLM" })).toBeInstanceOf(OpenLLMetryTransformer);
  });
  it("routes indexed gen_ai.prompt.N to OpenLLMetry", () => {
    expect(d.select({ "gen_ai.prompt.0.role": "user" })).toBeInstanceOf(OpenLLMetryTransformer);
  });
  it("routes the OTel GenAI v1.37 JSON-array shape to the OTel GenAI transformer", () => {
    expect(d.select({ "gen_ai.input.messages": "[]", "gen_ai.request.model": "gpt-4o" })).toBeInstanceOf(
      OtelGenAiTransformer
    );
  });
  it("falls back to OTel GenAI for unrecognized attributes", () => {
    expect(d.select({ "some.random.attr": "x" })).toBeInstanceOf(OtelGenAiTransformer);
  });
  it("prefers OpenInference over OpenLLMetry when both signatures are present", () => {
    expect(
      d.select({ "openinference.span.kind": "LLM", "traceloop.span.kind": "LLM" })
    ).toBeInstanceOf(OpenInferenceTransformer);
  });
});

describe("DispatchingTransformer — classify/transform agree with the selected extractor", () => {
  it("classify delegates to the routed transformer (OpenInference LLM → GENERATION)", () => {
    expect(d.classify(span("x"), { "openinference.span.kind": "LLM" })).toBe(SpanType.GENERATION);
  });
  it("transform delegates to the routed transformer (OpenLLMetry model extraction)", () => {
    const out = d.transform(span("x"), {
      "traceloop.span.kind": "LLM",
      "gen_ai.response.model": "gpt-4o-mini",
    });
    expect(out.model).toBe("gpt-4o-mini");
  });
  it("transform falls through to OTel GenAI for the canonical messages shape", () => {
    const out = d.transform(span("chat m"), {
      "gen_ai.request.model": "gpt-4o",
      "gen_ai.input.messages": JSON.stringify([{ role: "user", content: "hi" }]),
    });
    expect(out.model).toBe("gpt-4o");
    expect(out.input).toEqual([{ role: "user", content: "hi" }]);
  });
});
