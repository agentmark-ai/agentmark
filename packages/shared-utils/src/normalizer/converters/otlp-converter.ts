import { OtelResource, OtelScope, OtelSpan, OtelEvent, OtelLink } from '../types';

/**
 * OTLP attribute value types
 */
export interface OtlpAttributeValue {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: {
    values?: OtlpAttributeValue[];
  };
  bytesValue?: string | Uint8Array;
}

/**
 * OTLP attribute structure
 */
export interface OtlpAttribute {
  key: string;
  value: OtlpAttributeValue;
}

/**
 * Raw OTLP span structure
 */
export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceState?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes?: OtlpAttribute[];
  events?: OtlpEvent[];
  links?: OtlpLink[];
  status?: {
    code: number;
    message?: string;
  };
  droppedAttributesCount?: number;
  droppedEventsCount?: number;
  droppedLinksCount?: number;
}

/**
 * Raw OTLP event structure
 */
export interface OtlpEvent {
  timeUnixNano: string;
  name: string;
  attributes?: OtlpAttribute[];
  droppedAttributesCount?: number;
}

/**
 * Raw OTLP link structure
 */
export interface OtlpLink {
  traceId: string;
  spanId: string;
  traceState?: string;
  attributes?: OtlpAttribute[];
  droppedAttributesCount?: number;
}

/**
 * Raw OTLP resource structure
 */
export interface OtlpResource {
  attributes?: OtlpAttribute[];
  droppedAttributesCount?: number;
}

/**
 * Raw OTLP scope structure
 */
export interface OtlpScope {
  name?: string;
  version?: string;
}

/**
 * Raw OTLP scope spans structure
 */
export interface OtlpScopeSpans {
  scope?: OtlpScope;
  spans: OtlpSpan[];
}

/**
 * Raw OTLP resource spans structure
 */
export interface OtlpResourceSpans {
  resource?: OtlpResource;
  scopeSpans: OtlpScopeSpans[];
}

/**
 * Convert OTLP attribute value to JavaScript value
 */
function convertOtlpValue(value: OtlpAttributeValue): any {
  if (value.stringValue !== undefined) {
    return value.stringValue;
  }
  if (value.intValue !== undefined) {
    // OTLP intValue can be string or number
    return typeof value.intValue === 'string' ? parseInt(value.intValue, 10) : value.intValue;
  }
  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }
  if (value.boolValue !== undefined) {
    return value.boolValue;
  }
  if (value.arrayValue?.values) {
    return value.arrayValue.values.map(convertOtlpValue);
  }
  if (value.bytesValue !== undefined) {
    // Return as-is for bytes, caller can handle if needed
    return value.bytesValue;
  }
  return undefined;
}

/**
 * Convert OTLP attribute array to flat Record<string, any>
 */
export function convertOtlpAttributes(attributes?: OtlpAttribute[]): Record<string, any> {
  if (!attributes || attributes.length === 0) {
    return {};
  }

  const result: Record<string, any> = {};
  for (const attr of attributes) {
    if (attr.key) {
      result[attr.key] = convertOtlpValue(attr.value);
    }
  }
  return result;
}

/**
 * Extract resource, scope, and span from OTLP structure
 */
export function extractResourceScopeSpan(
  resourceSpans: OtlpResourceSpans
): Array<{ resource: OtelResource; scope: OtelScope; span: OtelSpan }> {
  const result: Array<{ resource: OtelResource; scope: OtelScope; span: OtelSpan }> = [];

  // Convert resource attributes
  const resourceAttributes = convertOtlpAttributes(resourceSpans.resource?.attributes);

  // Process each scope spans
  for (const scopeSpans of resourceSpans.scopeSpans || []) {
    const scope: OtelScope = {
      name: scopeSpans.scope?.name,
      version: scopeSpans.scope?.version,
    };

    // Process each span
    for (const otlpSpan of scopeSpans.spans || []) {
      // Convert span attributes
      const spanAttributes = convertOtlpAttributes(otlpSpan.attributes);

      // Convert events
      const events: OtelEvent[] = (otlpSpan.events || []).map((otlpEvent) => ({
        timeUnixNano: otlpEvent.timeUnixNano,
        name: otlpEvent.name,
        attributes: convertOtlpAttributes(otlpEvent.attributes),
      }));

      // Convert links
      const links: OtelLink[] = (otlpSpan.links || []).map((otlpLink) => ({
        traceId: otlpLink.traceId,
        spanId: otlpLink.spanId,
        traceState: otlpLink.traceState,
        attributes: convertOtlpAttributes(otlpLink.attributes),
      }));

      const span: OtelSpan = {
        traceId: otlpSpan.traceId,
        spanId: otlpSpan.spanId,
        parentSpanId: otlpSpan.parentSpanId,
        traceState: otlpSpan.traceState,
        name: otlpSpan.name,
        kind: otlpSpan.kind,
        startTimeUnixNano: otlpSpan.startTimeUnixNano,
        endTimeUnixNano: otlpSpan.endTimeUnixNano,
        attributes: spanAttributes,
        events,
        links,
        status: otlpSpan.status,
      };

      const resource: OtelResource = {
        attributes: resourceAttributes,
      };

      result.push({ resource, scope, span });
    }
  }

  return result;
}

