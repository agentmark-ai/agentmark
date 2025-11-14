import { SpanExporter, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { ExportResult, ExportResultCode } from "@opentelemetry/core";
import { AGENTMARK_TRACE_ENDPOINT } from "../config";

export class AgentmarkExporter implements SpanExporter {
  private baseUrl: string;
  private apiKey: string;
  private isShutdown: boolean;
  private sendingPromises: Promise<unknown>[] = [];
  private appId: string;

  private generationSpans = [
    "ai.generateText.doGenerate",
    "ai.generateObject.doGenerate",
    "ai.streamText.doStream",
    "ai.streamObject.doStream",
  ];

  constructor(apiKey: string, appId: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.isShutdown = false;
    this.appId = appId;
    this.baseUrl = baseUrl;
  }

  async export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ) {
    if (this.isShutdown) {
      setTimeout(() =>
        resultCallback({
          code: ExportResultCode.FAILED,
          error: new Error("Exporter has been shutdown"),
        })
      );
      return;
    }

    const promise = new Promise<void>((resolve) => {
      this.sendSpans(spans, (result) => {
        resolve();
        resultCallback(result);
      });
    });

    this.sendingPromises.push(promise);
    const popPromise = () => {
      const index = this.sendingPromises.indexOf(promise);
      this.sendingPromises.splice(index, 1);
    };
    promise.then(popPromise, popPromise);
  }

  shutdown(): Promise<void> {
    this.isShutdown = true;
    return this.forceFlush();
  }

  /**
   * Exports any pending spans in exporter
   */
  forceFlush(): Promise<void> {
    return new Promise((resolve, reject) => {
      Promise.all(this.sendingPromises).then(() => {
        resolve();
      }, reject);
    });
  }

  private sendSpans(
    spans: ReadableSpan[],
    done?: (result: ExportResult) => void
  ) {
    const spanData = spans.map((span) => this.toAgentmarkFormat(span));
    fetch(`${this.baseUrl}/${AGENTMARK_TRACE_ENDPOINT}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `${this.apiKey}`,
        "X-Agentmark-App-Id": this.appId,
      },
      body: JSON.stringify(spanData),
      method: "POST",
    })
      .then(async (response) => {
        if (response.ok) {
          done?.({ code: ExportResultCode.SUCCESS });
        } else {
          done?.({
            code: ExportResultCode.FAILED,
            error: new Error(response.statusText),
          });
          throw new Error(await response.text());
        }
      })
      .catch((e) => {
        done?.({ code: ExportResultCode.FAILED, error: e });
        throw e;
      });
  }

  private hrTimeToNanos(hrTime: [number, number]) {
    const nanosInOneSecond = 1e9;
    const seconds = hrTime[0];
    const nanos = hrTime[1];
    return seconds * nanosInOneSecond + nanos;
  }

  private toAgentmarkFormat(span: ReadableSpan) {
    const events = span.events.map((event) => ({
      timestamp: this.hrTimeToNanos(event.time),
      name: event.name,
      attributes: event.attributes,
    }));
    const links = span.links.map((link) => ({
      traceId: link.context.traceId,
      spanId: link.context.spanId,
      traceState: link.context.traceState,
      attributes: link.attributes,
    }));

    const nanosInOneMilli = 1e6;

    const startTimeInNano = this.hrTimeToNanos(span.startTime);
    const endTimeInNano = this.hrTimeToNanos(span.endTime);

    const durationInMillis = Math.floor(
      (endTimeInNano - startTimeInNano) / nanosInOneMilli
    );

    const spanAttributes = {
      ...span.attributes,
      end_time: endTimeInNano,
    };

    let traceId = span.attributes[`ai.telemetry.metadata.traceId`];

    if (!traceId) {
      traceId = span.spanContext().traceId;
      delete spanAttributes[`ai.telemetry.metadata.traceId`];
    }

    let spanId = span.spanContext().spanId;

    if (spanAttributes[`ai.telemetry.metadata.spanId`]) {
      if (this.generationSpans.includes(span.name)) {
        spanId = spanAttributes[`ai.telemetry.metadata.spanId`];
      }
      delete spanAttributes[`ai.telemetry.metadata.spanId`];
    }

    return {
      Timestamp: startTimeInNano,
      TraceId: traceId,
      SpanId: spanId,
      ParentSpanId: (span as any).parentSpanId || "",
      TraceState: span.spanContext().traceState || "",
      SpanName: span.name,
      SpanKind: span.kind,
      ServiceName: span.resource.attributes["service.name"] || "",
      ResourceAttributes: span.resource.attributes,
      SpanAttributes: spanAttributes,
      Duration: durationInMillis,
      StatusCode: span.status.code,
      StatusMessage: span.status.message || "",
      "Events.Timestamp": events.map((event) => event.timestamp),
      "Events.Name": events.map((event) => event.name),
      "Events.Attributes": events.map((event) => event.attributes),
      "Links.TraceId": links.map((link) => link.traceId),
      "Links.SpanId": links.map((link) => link.spanId),
      "Links.TraceState": links.map((link) => link.traceState),
      "Links.Attributes": links.map((link) => link.attributes),
    };
  }
}
