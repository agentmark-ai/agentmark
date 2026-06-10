import type {
  ReadableSpan,
  SpanProcessor,
  Span,
} from "@opentelemetry/sdk-trace-base";
import type { Context } from "@opentelemetry/api";

export type MaskFunction = (data: string) => string;

export interface MaskingProcessorOptions {
  innerProcessor: SpanProcessor;
  mask?: MaskFunction;
  hideInputs?: boolean;
  hideOutputs?: boolean;
}

// Content-bearing input attributes. Covers the AgentMark executor keys
// (gen_ai.request.*), the Vercel AI SDK experimental_telemetry keys (ai.*),
// the OTel GenAI semantic-convention keys (gen_ai.input.messages et al.,
// plus the legacy gen_ai.prompt), and the claude-agent-sdk adapter's tool
// keys (gen_ai.tool.input). NOTE: this list MUST stay identical to
// INPUT_KEYS in sdk-python/src/agentmark_sdk/masking_processor.py.
export const INPUT_KEYS = new Set([
  // AgentMark executor / SDK
  "gen_ai.request.input",
  "gen_ai.request.tool_calls",
  // Vendor-namespaced observe()/setInput() key (dual-emitted with the
  // deprecated gen_ai.request.input during the OTel GenAI spec migration).
  "agentmark.request.input",
  // Carries the full JSON-serialized dataset row input (experiment runs).
  "agentmark.dataset_input",
  // Vercel AI SDK (experimental_telemetry) — each is a JSON string except
  // ai.prompt.tools, which is an array of JSON strings (handled below).
  "ai.prompt",
  "ai.prompt.messages",
  "ai.prompt.tools",
  "ai.prompt.toolChoice",
  "ai.toolCall.args",
  // OTel GenAI semantic conventions
  "gen_ai.input.messages",
  "gen_ai.system_instructions",
  "gen_ai.tool.definitions",
  "gen_ai.tool.call.arguments",
  // Legacy OTel GenAI key
  "gen_ai.prompt",
  // claude-agent-sdk adapter tool spans
  "gen_ai.tool.input",
]);

// Content-bearing output attributes. Same sources as INPUT_KEYS; the
// ai.result.* keys are the pre-v4 Vercel AI SDK aliases of ai.response.*.
// NOTE: this list MUST stay identical to OUTPUT_KEYS in
// sdk-python/src/agentmark_sdk/masking_processor.py.
export const OUTPUT_KEYS = new Set([
  // AgentMark executor / SDK
  "gen_ai.response.output",
  "gen_ai.response.output_object",
  // Vendor-namespaced observe()/setOutput() key (dual-emitted with the
  // deprecated gen_ai.response.output during the OTel GenAI spec migration).
  "agentmark.response.output",
  // Vercel AI SDK (experimental_telemetry)
  "ai.response.text",
  "ai.response.toolCalls",
  "ai.response.object",
  "ai.result.text",
  "ai.result.toolCalls",
  "ai.result.object",
  "ai.toolCall.result",
  // OTel GenAI semantic conventions
  "gen_ai.output.messages",
  "gen_ai.tool.call.result",
  // Legacy OTel GenAI key
  "gen_ai.completion",
  // claude-agent-sdk adapter tool spans
  "gen_ai.tool.output",
]);

// Keys not in SENSITIVE_KEYS are skipped entirely, so INPUT_KEYS/OUTPUT_KEYS
// membership alone would never redact them — derive the union so every
// input/output key is automatically sensitive (and mask-eligible).
const SENSITIVE_KEYS = new Set([...INPUT_KEYS, ...OUTPUT_KEYS]);

const METADATA_PREFIX = "agentmark.metadata.";

export class MaskingSpanProcessor implements SpanProcessor {
  private readonly inner: SpanProcessor;
  private readonly mask: MaskFunction | undefined;
  private readonly hideInputs: boolean;
  private readonly hideOutputs: boolean;

  constructor(options: MaskingProcessorOptions) {
    this.inner = options.innerProcessor;
    this.mask = options.mask;
    this.hideInputs = options.hideInputs ?? false;
    this.hideOutputs = options.hideOutputs ?? false;
  }

  onStart(span: Span, parentContext: Context): void {
    this.inner.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    try {
      // Cast to mutable — ReadableSpan.attributes is readonly only as a TS
      // constraint; the underlying object is a plain record.
      const attrs = span.attributes as Record<string, unknown>;

      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        const isSensitive = SENSITIVE_KEYS.has(key);
        const isMetadata = key.startsWith(METADATA_PREFIX);

        if (!isSensitive && !isMetadata) {
          continue;
        }

        if (typeof value === "string") {
          attrs[key] = this.maskValue(key, value, isSensitive);
        } else if (
          Array.isArray(value) &&
          value.every((item): item is string => typeof item === "string")
        ) {
          // Some content attributes are string arrays (e.g. the Vercel AI
          // SDK's ai.prompt.tools is an array of JSON-stringified tools).
          // Mask element-wise to preserve the OTel array attribute type.
          attrs[key] = value.map((item) =>
            this.maskValue(key, item, isSensitive)
          );
        }
      }
    } catch (error: unknown) {
      // Fail-closed: mask error means span is dropped (never exported unmasked)
      const message =
        error instanceof Error ? error.message : String(error);
      console.warn("[agentmark] Masking error — span dropped:", message);
      return;
    }

    // Forward to inner processor outside try/catch so inner-processor
    // errors propagate normally with their own stack traces.
    this.inner.onEnd(span);
  }

  private maskValue(key: string, value: string, isSensitive: boolean): string {
    let current = value;

    if (isSensitive) {
      if (INPUT_KEYS.has(key) && this.hideInputs) {
        current = "[REDACTED]";
      }
      if (OUTPUT_KEYS.has(key) && this.hideOutputs) {
        current = "[REDACTED]";
      }
    }

    if (this.mask) {
      current = this.mask(current);
    }

    return current;
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush();
  }
}
