import { NormalizedSpan, OtelResource, OtelScope, OtelSpan, SpanType } from './types';
import { registry } from './registry';
import { AiSdkTransformer } from './transformers/ai-sdk';
import { MastraTransformer } from './transformers/mastra';
import { AgentMarkTransformer } from './transformers/agentmark';
import { OtlpResourceSpans, extractResourceScopeSpan } from './converters/otlp-converter';
import { parseAgentMarkAttributes } from './extractors/agentmark-parser';

// Register transformers
registry.register('ai', new AiSdkTransformer());
registry.register('default-tracer', new MastraTransformer());
// Register AgentMark transformer - uses fixed scope name 'agentmark' from OTEL
registry.register('agentmark', new AgentMarkTransformer());
// Set AiSdkTransformer as default adapter for all scopes
registry.setDefault(new AiSdkTransformer());
// We can register more transformers here for other scopes (e.g. 'langchain')

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
        statusCode: span.status?.code.toString() || '0',
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

    // 6. Extract Tenant/App ID from Resource Attributes if not already set

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
export * from './transformers/ai-sdk';
export * from './transformers/ai-sdk/token-helpers';
export * from './transformers/ai-sdk/version-detector';
export * from './transformers/mastra';
export * from './transformers/agentmark';
