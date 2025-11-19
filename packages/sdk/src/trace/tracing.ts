import { NodeSDK } from "@opentelemetry/sdk-node";
import { AgentmarkExporter } from "./agentmark-exporter";
import { AgentmarkSampler } from "./sampler";
import api, { context, ROOT_CONTEXT, SpanStatusCode } from "@opentelemetry/api";
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";

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
  const agentmarkExporter = new AgentmarkExporter(apiKey, appId, baseUrl);
  const spanProcessor = disableBatch
    ? new SimpleSpanProcessor(agentmarkExporter)
    : new BatchSpanProcessor(agentmarkExporter);

  const sdk = new NodeSDK({
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

const MetadataKey = "ai.telemetry.metadata";

export const trace = <
  A extends unknown,
  F extends (...args: A[]) => ReturnType<F>,
>(
  options: TraceOptions,
  fn: F
) => {
  const tracer = api.trace.getTracer("ai");
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

export const component = <
  A extends unknown,
  F extends (...args: A[]) => ReturnType<F>,
>(
  options: TraceOptions,
  fn: F
) => {
  const tracer = api.trace.getTracer("ai");
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
