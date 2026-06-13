import { NormalizedSpan, OtelResource, OtelScope, OtelSpan, SpanType } from './types';
import { registry } from './registry';
import { AiSdkTransformer } from './transformers/ai-sdk';
import { MastraTransformer } from './transformers/mastra';
import { AgentMarkTransformer } from './transformers/agentmark';
import { OtelGenAiTransformer } from './transformers/otel-genai';
import { DispatchingTransformer } from './transformers/dispatching';
import { OtlpResourceSpans, extractResourceScopeSpan } from './converters/otlp-converter';
import { parseAgentMarkAttributes } from './extractors/agentmark-parser';
import { resolveSemanticKind } from './resolvers/semantic-kind-resolver';

// Register scope-specific transformers
registry.register('ai', new AiSdkTransformer());                    // Vercel AI SDK
registry.register('default-tracer', new MastraTransformer());        // Mastra
registry.register('agentmark', new AgentMarkTransformer());          // AgentMark SDK
registry.register('pydantic-ai', new OtelGenAiTransformer());       // Pydantic AI
// Default: signature-dispatching transformer. Routes OpenInference- and
// OpenLLMetry-instrumented spans (which each emit dozens of distinct scope
// names, so can't be scope-registered) to their extractors by attribute shape,
// and falls back to the official OTel GenAI semconv v1.37+ when neither matches.
registry.setDefault(new DispatchingTransformer());

/**
 * OTLP status.code arrives in different encodings depending on the SDK's
 * JSON serializer: the numeric enum value (0/1/2), the proto enum name
 * ('STATUS_CODE_ERROR'), or a short name ('Error', 'OK'). Normalize to the
 * canonical numeric strings '0' (Unset) / '1' (Ok) / '2' (Error) so every
 * downstream store (gateway ClickHouse rows, CLI local SQLite) gets one
 * vocabulary. Unknown values pass through unchanged.
 */
const OTLP_STATUS_CODE_MAP: Record<string, string> = {
    '0': '0', STATUS_CODE_UNSET: '0', UNSET: '0', Unset: '0',
    '1': '1', STATUS_CODE_OK: '1', OK: '1', Ok: '1',
    '2': '2', STATUS_CODE_ERROR: '2', ERROR: '2', Error: '2',
};

export function normalizeOtlpStatusCode(raw: string | number | undefined | null): string {
    if (raw === undefined || raw === null || raw === '') {
        return '0';
    }
    const key = String(raw);
    return OTLP_STATUS_CODE_MAP[key] ?? key;
}

export function normalizeSpan(
    resource: OtelResource,
    scope: OtelScope,
    span: OtelSpan
): NormalizedSpan {
    // 1. Merge attributes (Resource + Span)
    const allAttributes = {
        ...(resource.attributes || {}),
        ...(span.attributes || {}),
    };

    // 2. Get transformer and classify span type
    const transformer = registry.getTransformer(scope.name || '');
    const type = transformer
        ? transformer.classify(span, allAttributes)
        : SpanType.SPAN; // Default if no transformer

    // Timing (convert nanoseconds string to milliseconds number)
    // Use BigInt division to preserve precision, then add remainder for decimals
    const startNs = BigInt(span.startTimeUnixNano);
    const endNs = BigInt(span.endTimeUnixNano);
    const startMsInt = startNs / BigInt(1000000);
    const startMsRemainder = Number(startNs % BigInt(1000000)) / 1000000;
    const endMsInt = endNs / BigInt(1000000);
    const endMsRemainder = Number(endNs % BigInt(1000000)) / 1000000;
    const startMs = Number(startMsInt) + startMsRemainder;
    const endMs = Number(endMsInt) + endMsRemainder;

    // 3. Initialize base normalized span
    const normalized: NormalizedSpan = {
        // Identity
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        traceState: span.traceState,

        // Type
        type,

        // Timing (convert nanoseconds to milliseconds: divide by 1,000,000)
        startTime: startMs,
        endTime: endMs,
        duration: endMs - startMs,

        // Metadata
        name: span.name,
        kind: span.kind.toString(),
        serviceName: resource.attributes?.['service.name'] as string | undefined,
        statusCode: normalizeOtlpStatusCode(span.status?.code),
        statusMessage: span.status?.message,

        // Raw Data
        resourceAttributes: resource.attributes || {},
        spanAttributes: span.attributes || {},
        events: (span.events || []).map(e => ({
            timestamp: Number(BigInt(e.timeUnixNano)) / 1000000,
            name: e.name,
            attributes: e.attributes || {}
        })),
        links: (span.links || []).map(l => ({
            traceId: l.traceId,
            spanId: l.spanId,
            traceState: l.traceState,
            attributes: l.attributes
        })),
    };

    // 4. Apply Scope-Specific Transformation
    if (transformer) {
        const transformed = transformer.transform(span, allAttributes);
        Object.assign(normalized, transformed);
    }

    // 5. Parse agentmark.* attributes (direct SDK context attributes)
    // These take precedence over metadata.* attributes if both exist
    const agentMarkAttributes = parseAgentMarkAttributes(allAttributes);
    Object.assign(normalized, agentMarkAttributes);

    // 5b. Standard OTel GenAI conversation id (gen_ai.conversation.id) as a
    // sessionId fallback. agentmark.session_id always wins when present —
    // this only fills the gap for spec-conformant emitters.
    if (!normalized.sessionId && allAttributes['gen_ai.conversation.id']) {
        normalized.sessionId = String(allAttributes['gen_ai.conversation.id']);
    }

    // 6. Resolve semantic kind from all available attribute sources
    normalized.semanticKind = resolveSemanticKind(normalized, allAttributes);

    return normalized;
}

/**
 * Normalize spans from raw OTLP resourceSpans structure
 * This is a higher-level API that accepts raw OTLP format and handles conversion internally
 */
export function normalizeOtlpSpans(resourceSpans: OtlpResourceSpans[]): NormalizedSpan[] {
  const normalizedSpans: NormalizedSpan[] = [];

  for (const resourceSpan of resourceSpans) {
    const extracted = extractResourceScopeSpan(resourceSpan);
    for (const { resource, scope, span } of extracted) {
      normalizedSpans.push(normalizeSpan(resource, scope, span));
    }
  }

  return normalizedSpans;
}

export * from './types';
export * from './registry';
export * from './type-classifier';
export * from './converters/otlp-converter';
export { parseTokens } from './extractors/token-parser';
export * from './extractors/metadata-parser';
export * from './extractors/agentmark-parser';
export * from './extractors/indexed-message-parser';
export * from './resolvers/semantic-kind-resolver';
export * from './transformers/ai-sdk';
export * from './transformers/ai-sdk/token-helpers';
export * from './transformers/ai-sdk/version-detector';
export * from './transformers/mastra';
export * from './transformers/agentmark';
export * from './transformers/otel-genai';
export * from './transformers/openinference';
export * from './transformers/openllmetry';
export * from './transformers/dispatching';
