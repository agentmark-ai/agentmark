import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { AgentmarkSampler } from "./sampler";
import api, { context, ROOT_CONTEXT, SpanStatusCode } from "@opentelemetry/api";
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
    traceExporter: otlpExporter,
    sampler: new AgentmarkSampler(),
    spanProcessors: [spanProcessor],
  });
  sdk.start();
  return sdk;
};

type TraceOptions = {
  name: string;
  metadata?: Record<string, string>;
  sessionId?: string;
  sessionName?: string;
  userId?: string;
  datasetRunId?: string;
  datasetRunName?: string;
  datasetItemName?: string;
  datasetExpectedOutput?: string;
};

const MetadataKey = "agentmark.metadata";
const AgentMarkKey = "agentmark";

/**
 * Get the traceId from the currently active span context
 * @returns The traceId as a string, or null if no active span exists
 */
export const getActiveTraceId = (): string | null => {
  const span = api.trace.getActiveSpan();
  if (!span) {
    return null;
  }
  const spanContext = span.spanContext();
  return spanContext.traceId || null;
};

/**
 * Get the spanId from the currently active span context
 * @returns The spanId as a string, or null if no active span exists
 */
export const getActiveSpanId = (): string | null => {
  const span = api.trace.getActiveSpan();
  if (!span) {
    return null;
  }
  const spanContext = span.spanContext();
  return spanContext.spanId || null;
};

export const trace = <A, F extends (...args: A[]) => ReturnType<F>>(
  options: TraceOptions,
  fn: F
) => {
  const tracer = api.trace.getTracer("agentmark");
  return context.with(ROOT_CONTEXT, async () =>
    tracer.startActiveSpan(options.name, async (span) => {
      // Set agentmark.* attributes (snake_case)
      // Set trace_name from name (only for trace function)
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
      
      // Set metadata attributes (agentmark.metadata.*)
      if (options.metadata) {
        for (const [key, value] of Object.entries(options.metadata)) {
          span.setAttribute(`${MetadataKey}.${key}`, value);
        }
      }
      try {
        const response = fn();
        if (response instanceof Promise) {
          const result = await response;
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return response;
      } catch (e) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: e.message,
        });
        throw e;
      } finally {
        span.end();
      }
    })
  );
};

export const component = <A, F extends (...args: A[]) => ReturnType<F>>(
  options: TraceOptions,
  fn: F
) => {
  const tracer = api.trace.getTracer("agentmark");
  return tracer.startActiveSpan(options.name, async (span) => {
    // Set agentmark.* attributes (snake_case)
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
    
    // Set metadata attributes (agentmark.metadata.*)
    if (options.metadata) {
      for (const [key, value] of Object.entries(options.metadata)) {
        span.setAttribute(`${MetadataKey}.${key}`, value);
      }
    }
    try {
      const response = fn();
      if (response instanceof Promise) {
        const result = await response;
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      }
      span.setStatus({ code: SpanStatusCode.OK });
      return response;
    } catch (e) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: e.message,
      });
      throw e;
    } finally {
      span.end();
    }
  });
};
