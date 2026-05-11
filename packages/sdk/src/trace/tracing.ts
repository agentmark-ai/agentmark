import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { AgentmarkSampler } from "./sampler";
import api, { context, ROOT_CONTEXT, SpanStatusCode, Span, Tracer, Attributes } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { AGENTMARK_TRACE_ENDPOINT } from "../config";
import { serializeValue } from "./serialize";
import { MaskingSpanProcessor } from "./masking-processor";
import type { MaskFunction } from "./masking-processor";

type InitProps = {
  apiKey: string;
  appId: string;
  baseUrl: string;
  disableBatch: boolean;
  mask?: MaskFunction;
  /**
   * If true, also register this provider as the OTel global tracer provider
   * so third-party code calling `api.trace.getTracer()` flows into AgentMark.
   *
   * Default: false. AgentMark uses a dedicated provider so it coexists with
   * other OTel-based SDKs (e.g. Sentry, Datadog) that already own the global
   * provider. See https://github.com/agentmark-ai/app/issues/1131.
   */
  registerGlobally?: boolean;
};

// Module-level reference to the dedicated AgentMark provider. Set by
// initialize(); read by getAgentmarkTracer() to bypass the OTel global
// registry (which Sentry et al may have already claimed).
let agentmarkTracerProvider: NodeTracerProvider | null = null;
let warnedMissingProvider = false;

/**
 * Resolve the tracer used by AgentMark's span() and observe() helpers.
 *
 * When initialize() has been called, returns a tracer from AgentMark's
 * dedicated provider — independent of whatever else has registered itself
 * as the OTel global tracer provider. When initialize() has NOT been called,
 * logs a one-time warning and falls back to the global tracer (noop unless
 * a non-AgentMark SDK has registered one).
 */
export const getAgentmarkTracer = (): Tracer => {
  if (agentmarkTracerProvider) {
    return agentmarkTracerProvider.getTracer("agentmark");
  }
  if (!warnedMissingProvider) {
    warnedMissingProvider = true;
    console.warn(
      "[agentmark] span()/observe() called before AgentMarkSDK#initTracing(); " +
      "spans will not be exported. Call initTracing() at app startup."
    );
  }
  return api.trace.getTracer("agentmark");
};

// Test-only: reset the warning state between test cases.
export const _resetWarnedForTests = () => {
  warnedMissingProvider = false;
};

export const initialize = ({
  apiKey,
  appId,
  baseUrl,
  disableBatch,
  mask,
  registerGlobally = false,
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

  const hideInputs = process.env.AGENTMARK_HIDE_INPUTS === "true";
  const hideOutputs = process.env.AGENTMARK_HIDE_OUTPUTS === "true";

  const innerProcessor = disableBatch
    ? new SimpleSpanProcessor(otlpExporter)
    : new BatchSpanProcessor(otlpExporter);

  const spanProcessor =
    mask || hideInputs || hideOutputs
      ? new MaskingSpanProcessor({
          innerProcessor,
          mask,
          hideInputs,
          hideOutputs,
        })
      : innerProcessor;

  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "agentmark-client",
      "agentmark.app_id": appId,
    })
  );

  const provider = new NodeTracerProvider({
    resource,
    sampler: new AgentmarkSampler(),
    spanProcessors: [spanProcessor],
  });

  // Ensure async context propagation works for parent/child spans across
  // awaits. The OTel context API defaults to NoopContextManager — which
  // makes api.context.with() inert — until something registers a real one.
  // NodeSDK.start() used to do this as a side effect; the dedicated
  // NodeTracerProvider does not. setGlobalContextManager() is "first writer
  // wins" so this is a safe no-op if Sentry/Datadog already set one.
  const contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  api.context.setGlobalContextManager(contextManager);

  // If a previous AgentMark provider exists (e.g. re-init in tests), shut it
  // down so its batched spans flush and its exporter doesn't leak.
  if (agentmarkTracerProvider) {
    void agentmarkTracerProvider.shutdown();
  }
  agentmarkTracerProvider = provider;

  if (registerGlobally) {
    // Opt-in: expose this provider as the OTel global so third-party
    // auto-instrumentation flows into AgentMark. Note that this collides
    // with vendors like Sentry that also claim the global — first writer
    // wins, and a no-op warning is logged if we lose.
    provider.register();
  }

  // NodeTracerProvider already has shutdown() and forceFlush(). Wrap
  // shutdown so it also clears the module-level reference, otherwise
  // getAgentmarkTracer() would keep returning a tracer from a dead provider.
  const wrappedShutdown = provider.shutdown.bind(provider);
  provider.shutdown = async () => {
    if (agentmarkTracerProvider === provider) {
      agentmarkTracerProvider = null;
    }
    await wrappedShutdown();
  };

  return provider;
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
  const tracer = getAgentmarkTracer();

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
