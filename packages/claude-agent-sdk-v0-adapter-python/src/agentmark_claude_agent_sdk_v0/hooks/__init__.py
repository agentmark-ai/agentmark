"""Hooks module for telemetry and OpenTelemetry integration."""

from .otel_hooks import (
    TRACER_SCOPE_NAME,
    AgentMarkAttributes,
    GenAIAttributes,
    SpanNames,
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
    # OTEL constants
    "GenAIAttributes",
    "AgentMarkAttributes",
    "SpanNames",
    "TRACER_SCOPE_NAME",
]
