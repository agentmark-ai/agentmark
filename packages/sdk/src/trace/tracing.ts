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
 * Options for creating a trace or span
 */
export type TraceOptions = {
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
 * Options for creating a child span
 */
export type SpanOptions = {
  name: string;
  metadata?: Record<string, string>;
};

/**
 * Context passed to trace/span callbacks with explicit access to trace info and child span creation
 */
export interface TraceContext {
  /** The trace ID for this trace */
  readonly traceId: string;
  /** The span ID for this span */
  readonly spanId: string;
  /** Set an attribute on this span */
  setAttribute: (key: string, value: string | number | boolean) => void;
  /** Add an event to this span */
  addEvent: (name: string, attributes?: Attributes) => void;
  /** Create a child span within this trace */
  span: <T>(options: SpanOptions, fn: (ctx: TraceContext) => Promise<T>) => Promise<T>;
}

const MetadataKey = "agentmark.metadata";
const AgentMarkKey = "agentmark";

/**
 * Build a TraceContext from an OpenTelemetry span
 */
function buildContext(span: Span, tracer: Tracer): TraceContext {
  const spanContext = span.spanContext();

  const ctx: TraceContext = {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,

    setAttribute: (key: string, value: string | number | boolean) => {
      span.setAttribute(key, value);
    },

    addEvent: (name: string, attributes?: Attributes) => {
      span.addEvent(name, attributes);
    },

    span: async <T>(options: SpanOptions, fn: (ctx: TraceContext) => Promise<T>): Promise<T> => {
      // Create child span with this span as explicit parent
      const parentContext = api.trace.setSpan(api.context.active(), span);

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
function setAgentmarkAttributes(span: Span, options: TraceOptions): void {
  span.setAttribute(`${AgentMarkKey}.trace_name`, options.name);

  if (options.sessionId) {
    span.setAttribute(`${AgentMarkKey}.session_id`, options.sessionId);
  }
  if (options.sessionName) {
    span.setAttribute(`${AgentMarkKey}.session_name`, options.sessionName);
  }
  if (options.userId) {
    span.setAttribute(`${AgentMarkKey}.user_id`, options.userId);
  }
  if (options.datasetRunId) {
    span.setAttribute(`${AgentMarkKey}.dataset_run_id`, options.datasetRunId);
  }
  if (options.datasetRunName) {
    span.setAttribute(`${AgentMarkKey}.dataset_run_name`, options.datasetRunName);
  }
  if (options.datasetItemName) {
    span.setAttribute(`${AgentMarkKey}.dataset_item_name`, options.datasetItemName);
  }
  if (options.datasetExpectedOutput) {
    span.setAttribute(`${AgentMarkKey}.dataset_expected_output`, options.datasetExpectedOutput);
  }
  if (options.datasetPath) {
    span.setAttribute(`${AgentMarkKey}.dataset_path`, options.datasetPath);
  }

  if (options.metadata) {
    for (const [key, value] of Object.entries(options.metadata)) {
      span.setAttribute(`${MetadataKey}.${key}`, value);
    }
  }
}

/**
 * Result returned from the trace function
 */
export interface TraceResult<T> {
  /** The result of the traced function */
  result: Promise<T>;
  /** The trace ID for correlation */
  traceId: string;
}

/**
 * Start a new trace (root span) and execute a function within it.
 *
 * Returns both the result and traceId, eliminating the need for closure mutation.
 *
 * The callback receives a TraceContext with:
 * - traceId: The trace ID for correlation
 * - spanId: The span ID for this root span
 * - setAttribute(): Add attributes to the span
 * - addEvent(): Add events to the span
 * - span(): Create child spans within this trace
 *
 * @example
 * ```typescript
 * const { result, traceId } = await trace({ name: 'request-handler' }, async (ctx) => {
 *   // Create child spans
 *   const user = await ctx.span({ name: 'fetch-user' }, async (spanCtx) => {
 *     return db.getUser(id);
 *   });
 *
 *   return user;
 * });
 * // traceId is available here without closure mutation
 * ```
 */
export const trace = async <T>(
  options: TraceOptions,
  fn: (ctx: TraceContext) => Promise<T>
): Promise<TraceResult<T>> => {
  const tracer = api.trace.getTracer("agentmark");

  return context.with(ROOT_CONTEXT, () =>
    tracer.startActiveSpan(options.name, (span) => {
      setAgentmarkAttributes(span, options);

      const ctx = buildContext(span, tracer);
      const traceId = ctx.traceId;
      try {
        const result = fn(ctx);
        // Handle promise completion to set status and end span
        result
          .then(() => {
            span.setStatus({ code: SpanStatusCode.OK });
          })
          .catch((e: any) => {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: e.message,
            });
          })
          .finally(() => {
            span.end();
          });
        return { result, traceId };
      } catch (e: any) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: e.message,
        });
        span.end();
        throw e;
      }
    })
  );
};
