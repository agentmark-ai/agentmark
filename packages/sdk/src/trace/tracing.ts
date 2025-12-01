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
};

const MetadataKey = "agentmark.metadata";

export const trace = <A, F extends (...args: A[]) => ReturnType<F>>(
  options: TraceOptions,
  fn: F
) => {
  const tracer = api.trace.getTracer("agentmark");
  return context.with(ROOT_CONTEXT, async () =>
    tracer.startActiveSpan(options.name, async (span) => {
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
