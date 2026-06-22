// @agentmark-ai/otel — group AgentMark traces by session, user, and metadata.
//
// This is a framework-agnostic OpenTelemetry helper: `withAgentMark` stashes
// grouping attributes in the OTel context, and `AgentMarkSpanProcessor` stamps
// them onto every span started in that scope (using the attribute keys
// AgentMark's normalizer reads), then batches them to AgentMark's OTLP endpoint.
//
// It is motivated by the Vercel AI SDK v7 telemetry model, where the user's
// `telemetry.metadata` is not emitted onto spans — so session/user/tag grouping
// can't ride it. But the helper is not AI SDK-specific: any OTel span created in
// the wrapped scope (HTTP, DB, custom) is grouped too.
import {
  context,
  createContextKey,
  type Attributes,
  type Context,
} from '@opentelemetry/api';
import {
  BatchSpanProcessor,
  type ReadableSpan,
  type Span,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const AGENTMARK_ATTRS = createContextKey('agentmark.grouping.attributes');
const DEFAULT_ENDPOINT = 'https://api.agentmark.co/v1/traces';

/** Friendly, camelCase grouping fields. */
export interface AgentMarkGrouping {
  sessionId?: string;
  sessionName?: string;
  userId?: string;
  traceName?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Translate the friendly grouping API into the exact span-attribute keys
 * AgentMark's normalizer reads: session/user/etc. live under
 * `ai.telemetry.metadata.*` (snake_case); tags live under `agentmark.tags`.
 * Exported for unit testing.
 */
export function toAgentMarkAttributes(grouping: AgentMarkGrouping): Attributes {
  const out: Attributes = {};
  // session/user/name fields live under `agentmark.*`, custom metadata under
  // `agentmark.metadata.*`, tags under `agentmark.tags` — the keys the AgentMark
  // normalizer promotes universally, for any span scope (not just AI SDK spans).
  // Object values use compact JSON (matches Python json.dumps(separators=...)).
  const set = (key: string, value: unknown): void => {
    if (value != null) out[`agentmark.${key}`] = String(value);
  };
  set('session_id', grouping.sessionId);
  set('session_name', grouping.sessionName);
  set('user_id', grouping.userId);
  set('trace_name', grouping.traceName);
  if (Array.isArray(grouping.tags) && grouping.tags.length > 0) {
    out['agentmark.tags'] = JSON.stringify(grouping.tags);
  }
  if (grouping.metadata && typeof grouping.metadata === 'object') {
    for (const [k, v] of Object.entries(grouping.metadata)) {
      if (v == null) continue;
      out[`agentmark.metadata.${k}`] =
        typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
  }
  return out;
}

/**
 * Run `fn` with AgentMark grouping active. Every span started inside — sync or
 * async, at any depth — is stamped with the grouping. Nesting merges (inner
 * fields win). Returns whatever `fn` returns.
 *
 * Requires an OpenTelemetry context manager to be registered (e.g. via
 * `NodeTracerProvider#register()` or `@vercel/otel`) so context propagates
 * across `await`.
 */
export function withAgentMark<T>(grouping: AgentMarkGrouping, fn: () => T): T {
  const previous =
    (context.active().getValue(AGENTMARK_ATTRS) as Attributes | undefined) ??
    {};
  const merged = { ...previous, ...toAgentMarkAttributes(grouping) };
  return context.with(context.active().setValue(AGENTMARK_ATTRS, merged), fn);
}

export interface AgentMarkSpanProcessorOptions {
  /** AgentMark API key (sent as the raw `Authorization` header, no `Bearer`). */
  apiKey?: string;
  /** AgentMark app id (sent as `X-Agentmark-App-Id`). */
  appId?: string;
  /** Override the OTLP endpoint (defaults to AgentMark cloud). */
  endpoint?: string;
  /** Inject a custom exporter (e.g. for tests). Bypasses apiKey/appId. */
  exporter?: SpanExporter;
}

/**
 * Span processor that (a) stamps the active grouping attributes onto each span
 * at start, then (b) batches + exports to AgentMark's OTLP endpoint.
 */
export class AgentMarkSpanProcessor implements SpanProcessor {
  private readonly delegate: BatchSpanProcessor;

  constructor(options: AgentMarkSpanProcessorOptions = {}) {
    const { apiKey, appId, endpoint = DEFAULT_ENDPOINT, exporter } = options;
    this.delegate = new BatchSpanProcessor(
      exporter ?? createDefaultExporter(apiKey, appId, endpoint),
    );
  }

  onStart(span: Span, parentContext: Context): void {
    const attrs = parentContext.getValue(AGENTMARK_ATTRS) as
      | Attributes
      | undefined;
    if (attrs) span.setAttributes(attrs);
  }

  onEnd(span: ReadableSpan): void {
    this.delegate.onEnd(span);
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
}

function createDefaultExporter(
  apiKey: string | undefined,
  appId: string | undefined,
  endpoint: string,
): SpanExporter {
  if (!apiKey || !appId) {
    throw new Error(
      'AgentMarkSpanProcessor requires { apiKey, appId } (or a custom exporter)',
    );
  }
  return new OTLPTraceExporter({
    url: endpoint,
    headers: { Authorization: apiKey, 'X-Agentmark-App-Id': appId },
  });
}
