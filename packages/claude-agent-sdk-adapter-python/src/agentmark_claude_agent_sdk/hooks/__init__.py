"""Hooks module for telemetry and OpenTelemetry integration."""

from .otel_hooks import (
    TRACER_SCOPE_NAME,
    AgentMarkAttributes,
    GenAIAttributes,
    OtelHooksConfig,
    OtelHooksResult,
    SpanNames,
    SpanStatusCode,
    TelemetryContext,
    combine_with_otel_hooks,
    complete_session,
    create_otel_hooks,
)
from .telemetry_hooks import (
    HookEventName,
    HooksConfig,
    TelemetryConfig,
    TelemetryEvent,
    TelemetryEventHandler,
    create_telemetry_hooks,
    merge_hooks,
)

__all__ = [
    # Telemetry hooks
    "TelemetryConfig",
    "TelemetryEvent",
    "TelemetryEventHandler",
    "HooksConfig",
    "HookEventName",
    "create_telemetry_hooks",
    "merge_hooks",
    # OTEL hooks
    "OtelHooksConfig",
    "OtelHooksResult",
    "TelemetryContext",
    "GenAIAttributes",
    "AgentMarkAttributes",
    "SpanNames",
    "SpanStatusCode",
    "create_otel_hooks",
    "complete_session",
    "combine_with_otel_hooks",
    "TRACER_SCOPE_NAME",
]
