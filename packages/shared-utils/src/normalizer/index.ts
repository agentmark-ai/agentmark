import { NormalizedSpan, OtelResource, OtelScope, OtelSpan, SpanType } from './types';
import { registry } from './registry';
import { AiSdkTransformer } from './transformers/ai-sdk';

// Register transformers
registry.register('ai', new AiSdkTransformer());
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

    // 3. Initialize base normalized span
    const normalized: NormalizedSpan = {
        // Identity
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,

        // Type
        type,

        // Timing (convert nanoseconds string to milliseconds number)
        startTime: parseInt(span.startTimeUnixNano, 10) / 1000000,
        endTime: parseInt(span.endTimeUnixNano, 10) / 1000000,
        duration: (parseInt(span.endTimeUnixNano, 10) - parseInt(span.startTimeUnixNano, 10)) / 1000000,

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
            timestamp: parseInt(e.timeUnixNano, 10) / 1000000,
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

    // 5. Extract Tenant/App ID from Resource Attributes if not already set

    return normalized;
}

export * from './types';
export * from './registry';
