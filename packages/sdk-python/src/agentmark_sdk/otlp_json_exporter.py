"""JSON OTLP span exporter for AgentMark.

Sends spans as OTLP JSON over HTTP (Content-Type: application/json) with
trace/span IDs encoded as lowercase hex strings per the OTLP JSON spec.

This exists because the official Python OTel SDK only supports protobuf
over HTTP (opentelemetry-exporter-otlp-proto-http), and our gateway +
CLI API server expect JSON. The TS SDK similarly uses its own
JsonTraceSerializer for the same reason.
"""

from __future__ import annotations

import base64
import json
import urllib.request
from collections import defaultdict
from importlib.metadata import version as _pkg_version
from typing import Any, Sequence

from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.trace import SpanKind

# Cloudflare Browser Integrity Check rejects the default urllib User-Agent
# ("Python-urllib/x.y") with a 403 error code 1010. Set an explicit SDK UA so
# requests through proxied zones (api.agentmark.co et al) aren't blocked
# before reaching the gateway.
_SDK_USER_AGENT = f"agentmark-sdk-python/{_pkg_version('agentmark-sdk')}"

# OTLP wire format uses 1-indexed SpanKind values (UNSPECIFIED=0,
# INTERNAL=1, SERVER=2, ...) while the Python API uses 0-indexed
# (INTERNAL=0, SERVER=1, ...). This mapping is stable per the OTLP spec.
_SPAN_KIND_MAP: dict[SpanKind, int] = {
    SpanKind.INTERNAL: 1,
    SpanKind.SERVER: 2,
    SpanKind.CLIENT: 3,
    SpanKind.PRODUCER: 4,
    SpanKind.CONSUMER: 5,
}


class JsonOtlpSpanExporter(SpanExporter):
    """OTLP JSON span exporter over HTTP."""

    def __init__(self, endpoint: str, headers: dict[str, str] | None = None) -> None:
        self._endpoint = endpoint
        self._headers = headers or {}

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        """Serialize spans to OTLP JSON and POST to the endpoint."""
        resource_spans = _spans_to_otlp_json(spans)
        payload = json.dumps({"resourceSpans": resource_spans}).encode()

        req = urllib.request.Request(
            self._endpoint,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": _SDK_USER_AGENT,
                **self._headers,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status < 300:
                    return SpanExportResult.SUCCESS
                return SpanExportResult.FAILURE
        except Exception:
            return SpanExportResult.FAILURE

    def shutdown(self) -> None:
        pass


def _spans_to_otlp_json(spans: Sequence[ReadableSpan]) -> list[dict[str, Any]]:
    """Convert SDK spans to OTLP JSON resourceSpans."""
    if not spans:
        return []

    # Group spans by resource, then by scope
    groups: dict[int, tuple[Any, dict[str, list[dict[str, Any]]]]] = {}

    for span in spans:
        res_key = id(span.resource)
        if res_key not in groups:
            groups[res_key] = (span.resource, defaultdict(list))

        scope_key = "unknown"
        scope_version: str | None = None
        if hasattr(span, "instrumentation_scope") and span.instrumentation_scope:
            scope_key = span.instrumentation_scope.name
            scope_version = getattr(span.instrumentation_scope, "version", None)

        groups[res_key][1][scope_key].append(_span_to_json(span))

    resource_spans: list[dict[str, Any]] = []
    for resource, scope_spans in groups.values():
        scope_spans_json: list[dict[str, Any]] = []
        for scope_name, spans_json in scope_spans.items():
            scope_obj: dict[str, Any] = {"name": scope_name}
            # Try to get scope version from the first span in this group
            for s in spans:
                if (
                    hasattr(s, "instrumentation_scope")
                    and s.instrumentation_scope
                    and s.instrumentation_scope.name == scope_name
                ):
                    version = getattr(s.instrumentation_scope, "version", None)
                    if version:
                        scope_obj["version"] = version
                    break
            scope_spans_json.append({"scope": scope_obj, "spans": spans_json})

        resource_spans.append({
            "resource": {
                "attributes": _attrs_to_json(resource.attributes) if resource else [],
            },
            "scopeSpans": scope_spans_json,
        })

    return resource_spans


def _span_to_json(span: ReadableSpan) -> dict[str, Any]:
    """Convert a single SDK span to OTLP JSON."""
    ctx = span.get_span_context()
    parent = span.parent

    kind = _SPAN_KIND_MAP.get(span.kind, 0) if span.kind is not None else 0

    result: dict[str, Any] = {
        "traceId": format(ctx.trace_id, "032x"),
        "spanId": format(ctx.span_id, "016x"),
        "name": span.name,
        "kind": kind,
        "startTimeUnixNano": str(span.start_time),
        "endTimeUnixNano": str(span.end_time or span.start_time),
        "attributes": _attrs_to_json(span.attributes),
        "status": {
            "code": span.status.status_code.value if hasattr(span.status.status_code, "value") else 0,
        },
    }

    # traceState
    if ctx.trace_state is not None:
        header = ctx.trace_state.to_header()
        if header:
            result["traceState"] = header

    # parentSpanId
    if parent:
        parent_ctx = parent if hasattr(parent, "span_id") else None
        if parent_ctx:
            result["parentSpanId"] = format(parent_ctx.span_id, "016x")

    # status message
    if span.status.description:
        result["status"]["message"] = span.status.description

    # events
    if span.events:
        result["events"] = []
        for e in span.events:
            event_json: dict[str, Any] = {
                "name": e.name,
                "timeUnixNano": str(e.timestamp),
                "attributes": _attrs_to_json(e.attributes),
            }
            dropped = getattr(e, "dropped_attributes", None)
            if dropped is not None:
                event_json["droppedAttributesCount"] = dropped
            result["events"].append(event_json)

    # links
    if span.links:
        result["links"] = []
        for link in span.links:
            link_ctx = link.context
            link_json: dict[str, Any] = {
                "traceId": format(link_ctx.trace_id, "032x"),
                "spanId": format(link_ctx.span_id, "016x"),
                "attributes": _attrs_to_json(link.attributes),
            }
            if link_ctx.trace_state is not None:
                link_header = link_ctx.trace_state.to_header()
                if link_header:
                    link_json["traceState"] = link_header
            dropped_link_attrs = getattr(link, "dropped_attributes", None)
            if dropped_link_attrs is not None:
                link_json["droppedAttributesCount"] = dropped_link_attrs
            result["links"].append(link_json)

    # dropped counts
    dropped_attrs = getattr(span, "dropped_attributes", None)
    if dropped_attrs is not None:
        result["droppedAttributesCount"] = dropped_attrs
    dropped_events = getattr(span, "dropped_events", None)
    if dropped_events is not None:
        result["droppedEventsCount"] = dropped_events
    dropped_links = getattr(span, "dropped_links", None)
    if dropped_links is not None:
        result["droppedLinksCount"] = dropped_links

    return result


def _attrs_to_json(attrs: Any) -> list[dict[str, Any]]:
    """Convert attributes to OTLP JSON key-value array."""
    if not attrs:
        return []
    result: list[dict[str, Any]] = []
    for key, value in dict(attrs).items():
        result.append({"key": key, "value": _to_any_value(value)})
    return result


def _to_any_value(value: Any) -> dict[str, Any]:
    """Convert a single attribute value to OTLP JSON AnyValue."""
    if isinstance(value, bool):
        return {"boolValue": value}
    elif isinstance(value, int):
        return {"intValue": str(value)}
    elif isinstance(value, float):
        return {"doubleValue": value}
    elif isinstance(value, bytes):
        return {"bytesValue": base64.b64encode(value).decode()}
    elif isinstance(value, (list, tuple)):
        return {"arrayValue": {"values": [_to_any_value(v) for v in value]}}
    elif isinstance(value, dict):
        return {"kvlistValue": {"values": [{"key": k, "value": _to_any_value(v)} for k, v in value.items()]}}
    else:
        return {"stringValue": str(value)}
