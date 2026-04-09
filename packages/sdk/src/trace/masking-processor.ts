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

const SENSITIVE_KEYS = new Set([
  "gen_ai.request.input",
  "gen_ai.response.output",
  "gen_ai.response.output_object",
  "gen_ai.request.tool_calls",
]);

const INPUT_KEYS = new Set([
  "gen_ai.request.input",
  "gen_ai.request.tool_calls",
]);

const OUTPUT_KEYS = new Set([
  "gen_ai.response.output",
  "gen_ai.response.output_object",
]);

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
        if (typeof value !== "string") {
          continue;
        }

        const isSensitive = SENSITIVE_KEYS.has(key);
        const isMetadata = key.startsWith(METADATA_PREFIX);

        if (!isSensitive && !isMetadata) {
          continue;
        }

        let current = value;

        if (isSensitive) {
          const isInput = INPUT_KEYS.has(key);
          const isOutput = OUTPUT_KEYS.has(key);

          if (isInput && this.hideInputs) {
            current = "[REDACTED]";
          }

          if (isOutput && this.hideOutputs) {
            current = "[REDACTED]";
          }
        }

        if (this.mask) {
          current = this.mask(current);
        }

        attrs[key] = current;
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

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush();
  }
}
