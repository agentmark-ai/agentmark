"""Tests for the JSON OTLP span exporter."""

from __future__ import annotations

import base64
import json
from unittest.mock import MagicMock, patch

import pytest
from opentelemetry.trace import SpanKind, StatusCode

from agentmark_sdk.otlp_json_exporter import (
    JsonOtlpSpanExporter,
    _attrs_to_json,
    _span_to_json,
    _spans_to_otlp_json,
    _to_any_value,
)


def _make_mock_span(
    trace_id: int = 0xABCDEF1234567890ABCDEF1234567890,
    span_id: int = 0x1234567890ABCDEF,
    name: str = "test-span",
    kind: SpanKind = SpanKind.SERVER,
    start_time: int = 1700000000000000000,
    end_time: int = 1700000001000000000,
    attributes: dict | None = None,
    events: list | None = None,
    links: list | None = None,
    status_code: StatusCode = StatusCode.OK,
    status_description: str | None = None,
    parent_span_id: int | None = None,
    resource_attrs: dict | None = None,
    scope_name: str = "test-scope",
    scope_version: str | None = "1.0",
    trace_state: MagicMock | None = None,
) -> MagicMock:
    """Create a mock SDK span for testing."""
    mock_span = MagicMock()

    mock_ctx = MagicMock()
    mock_ctx.trace_id = trace_id
    mock_ctx.span_id = span_id
    mock_ctx.trace_state = trace_state
    mock_span.get_span_context.return_value = mock_ctx

    mock_span.name = name
    mock_span.kind = kind
    mock_span.start_time = start_time
    mock_span.end_time = end_time
    mock_span.attributes = attributes or {"key": "value"}
    mock_span.events = events or []
    mock_span.links = links or []

    mock_status = MagicMock()
    mock_status.status_code = status_code
    mock_status.description = status_description
    mock_span.status = mock_status

    if parent_span_id is not None:
        parent_ctx = MagicMock()
        parent_ctx.span_id = parent_span_id
        mock_span.parent = parent_ctx
    else:
        mock_span.parent = None

    mock_resource = MagicMock()
    mock_resource.attributes = resource_attrs or {"service.name": "test"}
    mock_span.resource = mock_resource

    mock_scope = MagicMock()
    mock_scope.name = scope_name
    mock_scope.version = scope_version
    mock_span.instrumentation_scope = mock_scope

    # Remove dropped_* attributes so getattr returns None (not MagicMock)
    del mock_span.dropped_attributes
    del mock_span.dropped_events
    del mock_span.dropped_links

    return mock_span


class TestTraceIdFormat:
    def test_trace_id_is_lowercase_hex_32_chars(self) -> None:
        span = _make_mock_span(trace_id=0xABCDEF1234567890ABCDEF1234567890)
        result = _span_to_json(span)
        assert result["traceId"] == "abcdef1234567890abcdef1234567890"
        assert len(result["traceId"]) == 32

    def test_span_id_is_lowercase_hex_16_chars(self) -> None:
        span = _make_mock_span(span_id=0x1234567890ABCDEF)
        result = _span_to_json(span)
        assert result["spanId"] == "1234567890abcdef"
        assert len(result["spanId"]) == 16

    def test_trace_id_zero_padded(self) -> None:
        span = _make_mock_span(trace_id=0x1)
        result = _span_to_json(span)
        assert result["traceId"] == "00000000000000000000000000000001"
        assert len(result["traceId"]) == 32

    def test_span_id_zero_padded(self) -> None:
        span = _make_mock_span(span_id=0x1)
        result = _span_to_json(span)
        assert result["spanId"] == "0000000000000001"
        assert len(result["spanId"]) == 16


class TestSpanKindOffset:
    def test_internal_maps_to_1(self) -> None:
        span = _make_mock_span(kind=SpanKind.INTERNAL)
        result = _span_to_json(span)
        assert result["kind"] == 1

    def test_server_maps_to_2(self) -> None:
        span = _make_mock_span(kind=SpanKind.SERVER)
        result = _span_to_json(span)
        assert result["kind"] == 2

    def test_client_maps_to_3(self) -> None:
        span = _make_mock_span(kind=SpanKind.CLIENT)
        result = _span_to_json(span)
        assert result["kind"] == 3

    def test_producer_maps_to_4(self) -> None:
        span = _make_mock_span(kind=SpanKind.PRODUCER)
        result = _span_to_json(span)
        assert result["kind"] == 4

    def test_consumer_maps_to_5(self) -> None:
        span = _make_mock_span(kind=SpanKind.CONSUMER)
        result = _span_to_json(span)
        assert result["kind"] == 5


class TestAttributeTypes:
    def test_string_attribute(self) -> None:
        result = _to_any_value("hello")
        assert result == {"stringValue": "hello"}

    def test_int_attribute(self) -> None:
        result = _to_any_value(42)
        assert result == {"intValue": "42"}

    def test_float_attribute(self) -> None:
        result = _to_any_value(3.14)
        assert result == {"doubleValue": 3.14}

    def test_bool_attribute(self) -> None:
        result = _to_any_value(True)
        assert result == {"boolValue": True}

    def test_bool_false_attribute(self) -> None:
        result = _to_any_value(False)
        assert result == {"boolValue": False}

    def test_bytes_attribute(self) -> None:
        data = b"hello"
        result = _to_any_value(data)
        expected_b64 = base64.b64encode(data).decode()
        assert result == {"bytesValue": expected_b64}

    def test_array_attribute(self) -> None:
        result = _to_any_value([1, "two", 3.0])
        assert result == {
            "arrayValue": {
                "values": [
                    {"intValue": "1"},
                    {"stringValue": "two"},
                    {"doubleValue": 3.0},
                ]
            }
        }

    def test_dict_attribute(self) -> None:
        result = _to_any_value({"nested_key": "nested_val", "num": 42})
        assert result == {
            "kvlistValue": {
                "values": [
                    {"key": "nested_key", "value": {"stringValue": "nested_val"}},
                    {"key": "num", "value": {"intValue": "42"}},
                ]
            }
        }

    def test_nested_array_attribute(self) -> None:
        result = _to_any_value([[1, 2], [3, 4]])
        assert result == {
            "arrayValue": {
                "values": [
                    {"arrayValue": {"values": [{"intValue": "1"}, {"intValue": "2"}]}},
                    {"arrayValue": {"values": [{"intValue": "3"}, {"intValue": "4"}]}},
                ]
            }
        }

    def test_tuple_attribute(self) -> None:
        result = _to_any_value((1, "two"))
        assert result == {
            "arrayValue": {
                "values": [
                    {"intValue": "1"},
                    {"stringValue": "two"},
                ]
            }
        }


class TestAttrsToJson:
    def test_empty_attrs(self) -> None:
        assert _attrs_to_json(None) == []
        assert _attrs_to_json({}) == []

    def test_mixed_attrs(self) -> None:
        result = _attrs_to_json({"str": "val", "num": 42, "flag": True})
        assert result == [
            {"key": "str", "value": {"stringValue": "val"}},
            {"key": "num", "value": {"intValue": "42"}},
            {"key": "flag", "value": {"boolValue": True}},
        ]


class TestTimestamps:
    def test_timestamps_as_nanos_strings(self) -> None:
        span = _make_mock_span(
            start_time=1700000000000000000,
            end_time=1700000001000000000,
        )
        result = _span_to_json(span)
        assert result["startTimeUnixNano"] == "1700000000000000000"
        assert result["endTimeUnixNano"] == "1700000001000000000"
        assert isinstance(result["startTimeUnixNano"], str)
        assert isinstance(result["endTimeUnixNano"], str)


class TestParentSpanId:
    def test_parent_span_id_included(self) -> None:
        span = _make_mock_span(parent_span_id=0xFEDCBA9876543210)
        result = _span_to_json(span)
        assert result["parentSpanId"] == "fedcba9876543210"

    def test_parent_span_id_absent(self) -> None:
        span = _make_mock_span(parent_span_id=None)
        result = _span_to_json(span)
        assert "parentSpanId" not in result


class TestEvents:
    def test_events_serialized(self) -> None:
        mock_event = MagicMock()
        mock_event.name = "exception"
        mock_event.timestamp = 1700000000500000000
        mock_event.attributes = {"exception.message": "something broke"}
        # No dropped_attributes attribute
        del mock_event.dropped_attributes

        span = _make_mock_span(events=[mock_event])
        result = _span_to_json(span)

        assert "events" in result
        assert len(result["events"]) == 1
        event = result["events"][0]
        assert event["name"] == "exception"
        assert event["timeUnixNano"] == "1700000000500000000"
        assert event["attributes"] == [
            {"key": "exception.message", "value": {"stringValue": "something broke"}}
        ]

    def test_event_dropped_attributes_count(self) -> None:
        mock_event = MagicMock()
        mock_event.name = "log"
        mock_event.timestamp = 1700000000500000000
        mock_event.attributes = {}
        mock_event.dropped_attributes = 3

        span = _make_mock_span(events=[mock_event])
        result = _span_to_json(span)

        assert result["events"][0]["droppedAttributesCount"] == 3


class TestLinks:
    def test_links_serialized(self) -> None:
        mock_link = MagicMock()
        mock_link_ctx = MagicMock()
        mock_link_ctx.trace_id = 0x11111111111111111111111111111111
        mock_link_ctx.span_id = 0x2222222222222222
        mock_link_ctx.trace_state = None
        mock_link.context = mock_link_ctx
        mock_link.attributes = {"link.attr": "val"}
        # No dropped_attributes attribute
        del mock_link.dropped_attributes

        span = _make_mock_span(links=[mock_link])
        result = _span_to_json(span)

        assert "links" in result
        assert len(result["links"]) == 1
        link = result["links"][0]
        assert link["traceId"] == "11111111111111111111111111111111"
        assert link["spanId"] == "2222222222222222"
        assert link["attributes"] == [
            {"key": "link.attr", "value": {"stringValue": "val"}}
        ]
        assert "traceState" not in link


class TestStatus:
    def test_status_code_and_message(self) -> None:
        span = _make_mock_span(
            status_code=StatusCode.ERROR,
            status_description="something failed",
        )
        result = _span_to_json(span)
        assert result["status"]["code"] == StatusCode.ERROR.value
        assert result["status"]["message"] == "something failed"

    def test_status_ok_no_message(self) -> None:
        span = _make_mock_span(status_code=StatusCode.OK)
        result = _span_to_json(span)
        assert result["status"]["code"] == StatusCode.OK.value
        assert "message" not in result["status"]


class TestResourceGrouping:
    def test_resource_grouping(self) -> None:
        resource_a = MagicMock()
        resource_a.attributes = {"service.name": "svc-a"}

        span1 = _make_mock_span(name="span1")
        span1.resource = resource_a
        span2 = _make_mock_span(name="span2")
        span2.resource = resource_a

        result = _spans_to_otlp_json([span1, span2])
        assert len(result) == 1
        assert result[0]["resource"]["attributes"] == [
            {"key": "service.name", "value": {"stringValue": "svc-a"}}
        ]

    def test_different_resources_separate(self) -> None:
        resource_a = MagicMock()
        resource_a.attributes = {"service.name": "svc-a"}
        resource_b = MagicMock()
        resource_b.attributes = {"service.name": "svc-b"}

        span1 = _make_mock_span(name="span1")
        span1.resource = resource_a
        span2 = _make_mock_span(name="span2")
        span2.resource = resource_b

        result = _spans_to_otlp_json([span1, span2])
        assert len(result) == 2


class TestScopeGrouping:
    def test_scope_grouping(self) -> None:
        scope = MagicMock()
        scope.name = "my-scope"
        scope.version = "2.0"

        span1 = _make_mock_span(name="span1", scope_name="my-scope", scope_version="2.0")
        span2 = _make_mock_span(name="span2", scope_name="my-scope", scope_version="2.0")
        # Ensure same resource
        span2.resource = span1.resource

        result = _spans_to_otlp_json([span1, span2])
        assert len(result) == 1
        assert len(result[0]["scopeSpans"]) == 1
        assert result[0]["scopeSpans"][0]["scope"]["name"] == "my-scope"
        assert result[0]["scopeSpans"][0]["scope"]["version"] == "2.0"
        assert len(result[0]["scopeSpans"][0]["spans"]) == 2

    def test_different_scopes_separate(self) -> None:
        span1 = _make_mock_span(name="span1", scope_name="scope-a")
        span2 = _make_mock_span(name="span2", scope_name="scope-b")
        # Same resource
        span2.resource = span1.resource

        result = _spans_to_otlp_json([span1, span2])
        assert len(result) == 1
        assert len(result[0]["scopeSpans"]) == 2


class TestEdgeCases:
    def test_empty_spans_returns_empty(self) -> None:
        result = _spans_to_otlp_json([])
        assert result == []

    def test_no_events_key_absent(self) -> None:
        span = _make_mock_span(events=[])
        result = _span_to_json(span)
        assert "events" not in result

    def test_no_links_key_absent(self) -> None:
        span = _make_mock_span(links=[])
        result = _span_to_json(span)
        assert "links" not in result

    def test_trace_state_included(self) -> None:
        mock_ts = MagicMock()
        mock_ts.to_header.return_value = "vendor1=value1"
        span = _make_mock_span(trace_state=mock_ts)
        result = _span_to_json(span)
        assert result["traceState"] == "vendor1=value1"

    def test_trace_state_empty_not_included(self) -> None:
        mock_ts = MagicMock()
        mock_ts.to_header.return_value = ""
        span = _make_mock_span(trace_state=mock_ts)
        result = _span_to_json(span)
        assert "traceState" not in result


class TestExporterExport:
    @patch("agentmark_sdk.otlp_json_exporter.urllib.request.urlopen")
    def test_export_success(self, mock_urlopen: MagicMock) -> None:
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        exporter = JsonOtlpSpanExporter(
            endpoint="http://localhost:9418/v1/traces",
            headers={"Authorization": "test-key"},
        )

        from opentelemetry.sdk.trace.export import SpanExportResult

        span = _make_mock_span()
        result = exporter.export([span])
        assert result == SpanExportResult.SUCCESS

        # Verify the request
        call_args = mock_urlopen.call_args
        req = call_args[0][0]
        assert req.get_header("Content-type") == "application/json"
        assert req.get_header("Authorization") == "test-key"

        body = json.loads(req.data.decode())
        assert "resourceSpans" in body

    @patch("agentmark_sdk.otlp_json_exporter.urllib.request.urlopen")
    def test_export_failure(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.side_effect = Exception("connection refused")

        exporter = JsonOtlpSpanExporter(endpoint="http://localhost:9418/v1/traces")

        from opentelemetry.sdk.trace.export import SpanExportResult

        span = _make_mock_span()
        result = exporter.export([span])
        assert result == SpanExportResult.FAILURE
