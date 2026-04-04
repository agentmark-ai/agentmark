import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { AgentmarkSampler } from "./sampler";
import api, { context, ROOT_CONTEXT, SpanStatusCode, Span, Tracer, Attributes } from "@opentelemetry/api";
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { AGENTMARK_TRACE_ENDPOINT } from "../config";
import { serializeValue } from "./serialize";

type InitProps = {
  apiKey: string;
  appId: string;
  baseUrl: string;
  disableBatch: boolean;
};

export const initialize = ({
  apiKey,
  appId,
  baseUrl,
  disableBatch,
}: InitProps) => {
  // Append the standard OTLP endpoint path to all URLs
  const exporterUrl = `${baseUrl}/${AGENTMARK_TRACE_ENDPOINT}`;

  const otlpExporter = new OTLPTraceExporter({
    url: exporterUrl,
    headers: {
      Authorization: apiKey,
      "X-Agentmark-App-Id": appId,
    },
  });

  const spanProcessor = disableBatch
    ? new SimpleSpanProcessor(otlpExporter)
    : new BatchSpanProcessor(otlpExporter);

  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "agentmark-client",
      "agentmark.app_id": appId,
    })
  );

  const sdk = new NodeSDK({
    resource,
    sampler: new AgentmarkSampler(),
    spanProcessors: [spanProcessor],
  });
  sdk.start();
  return sdk;
};

/**
 * Options for creating a span
 */
export type SpanOptions = {
  name: string;
  metadata?: Record<string, string>;
  sessionId?: string;
  sessionName?: string;
  userId?: string;
  datasetRunId?: string;
  datasetRunName?: string;
  datasetItemName?: string;
  datasetExpectedOutput?: string;
  datasetPath?: string;
};

/**
 * Context passed to span callbacks with explicit access to trace info and child span creation
 */
export interface SpanContext {
  /** The trace ID for this trace */
  readonly traceId: string;
  /** The span ID for this span */
  readonly spanId: string;
  /** Set an attribute on this span */
  setAttribute: (key: string, value: string | number | boolean) => void;
  /** Add an event to this span */
  addEvent: (name: string, attributes?: Attributes) => void;
  /** Set the input for this span (displayed in the UI Input tab) */
  setInput: (value: unknown) => void;
  /** Set the output for this span (displayed in the UI Output tab) */
  setOutput: (value: unknown) => void;
  /** Create a child span within this trace */
  span: <T>(options: { name: string; metadata?: Record<string, string> }, fn: (ctx: SpanContext) => Promise<T>) => Promise<T>;
}

const MetadataKey = "agentmark.metadata";
const AgentMarkKey = "agentmark";

/**
 * Build a SpanContext from an OpenTelemetry span
 */
function buildContext(otelSpan: Span, tracer: Tracer): SpanContext {
  const otelCtx = otelSpan.spanContext();

  const ctx: SpanContext = {
    traceId: otelCtx.traceId,
    spanId: otelCtx.spanId,

    setAttribute: (key: string, value: string | number | boolean) => {
      otelSpan.setAttribute(key, value);
    },

    addEvent: (name: string, attributes?: Attributes) => {
      otelSpan.addEvent(name, attributes);
    },

    setInput: (value: unknown) => {
      otelSpan.setAttribute("gen_ai.request.input", serializeValue(value));
    },

    setOutput: (value: unknown) => {
      otelSpan.setAttribute("gen_ai.response.output", serializeValue(value));
    },

    span: async <T>(options: { name: string; metadata?: Record<string, string> }, fn: (ctx: SpanContext) => Promise<T>): Promise<T> => {
      // Create child span with this span as explicit parent
      const parentContext = api.trace.setSpan(api.context.active(), otelSpan);

      return api.context.with(parentContext, () =>
        tracer.startActiveSpan(options.name, async (childSpan) => {
          // Set metadata attributes on child span
          if (options.metadata) {
            for (const [key, value] of Object.entries(options.metadata)) {
              childSpan.setAttribute(`${MetadataKey}.${key}`, value);
            }
          }

          const childCtx = buildContext(childSpan, tracer);
          try {
            const result = await fn(childCtx);
            childSpan.setStatus({ code: SpanStatusCode.OK });
            return result;
          } catch (e: any) {
            childSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: e.message,
            });
            throw e;
          } finally {
            childSpan.end();
          }
        })
      );
    },
  };

  return ctx;
}

/**
 * Set agentmark-specific attributes on a span
 */
function setAgentmarkAttributes(otelSpan: Span, options: SpanOptions): void {
  otelSpan.setAttribute(`${AgentMarkKey}.trace_name`, options.name);

  if (options.sessionId) {
    otelSpan.setAttribute(`${AgentMarkKey}.session_id`, options.sessionId);
  }
  if (options.sessionName) {
    otelSpan.setAttribute(`${AgentMarkKey}.session_name`, options.sessionName);
  }
  if (options.userId) {
    otelSpan.setAttribute(`${AgentMarkKey}.user_id`, options.userId);
  }
  if (options.datasetRunId) {
    otelSpan.setAttribute(`${AgentMarkKey}.dataset_run_id`, options.datasetRunId);
  }
  if (options.datasetRunName) {
    otelSpan.setAttribute(`${AgentMarkKey}.dataset_run_name`, options.datasetRunName);
  }
  if (options.datasetItemName) {
    otelSpan.setAttribute(`${AgentMarkKey}.dataset_item_name`, options.datasetItemName);
  }
  if (options.datasetExpectedOutput) {
    otelSpan.setAttribute(`${AgentMarkKey}.dataset_expected_output`, options.datasetExpectedOutput);
  }
  if (options.datasetPath) {
    otelSpan.setAttribute(`${AgentMarkKey}.dataset_path`, options.datasetPath);
  }

  if (options.metadata) {
    for (const [key, value] of Object.entries(options.metadata)) {
      otelSpan.setAttribute(`${MetadataKey}.${key}`, value);
    }
  }
}

/**
 * Result returned from the span function
 */
export interface SpanResult<T> {
  /** The result of the observed function */
  result: Promise<T>;
  /** The trace ID for correlation */
  traceId: string;
}

/**
 * Create a span and execute a function within it.
 *
 * Returns both the result and traceId, eliminating the need for closure mutation.
 *
 * The callback receives a SpanContext with:
 * - traceId: The trace ID for correlation
 * - spanId: The span ID for this span
 * - setAttribute(): Add attributes to the span
 * - addEvent(): Add events to the span
 * - setInput(): Set the span input (displayed in the UI)
 * - setOutput(): Set the span output (displayed in the UI)
 * - span(): Create child spans
 *
 * @example
 * ```typescript
 * const { result, traceId } = await span({ name: 'request-handler' }, async (ctx) => {
 *   // Create child spans
 *   const user = await ctx.span({ name: 'fetch-user' }, async (childCtx) => {
 *     return db.getUser(id);
 *   });
 *
 *   return user;
 * });
 * // traceId is available here without closure mutation
 * ```
 */
export const span = async <T>(
  options: SpanOptions,
  fn: (ctx: SpanContext) => Promise<T>
): Promise<SpanResult<T>> => {
  const tracer = api.trace.getTracer("agentmark");

  // Use an async callback inside context.with so the active span context
  // propagates through all awaited promises (via AsyncLocalStorage).
  // Without this, child spans created in async callbacks lose their parent.
  return context.with(ROOT_CONTEXT, () =>
    tracer.startActiveSpan(options.name, async (otelSpan) => {
      setAgentmarkAttributes(otelSpan, options);

      const ctx = buildContext(otelSpan, tracer);
      const traceId = ctx.traceId;
      try {
        const value = await fn(ctx);
        otelSpan.setStatus({ code: SpanStatusCode.OK });
        return { result: Promise.resolve(value), traceId };
      } catch (e: any) {
        otelSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: e.message,
        });
        throw e;
      } finally {
        otelSpan.end();
      }
    })
  );
};
