"""AgentMark SDK for Python.

Provides OpenTelemetry-based tracing and observability for AI applications.

Example:
    from agentmark_sdk import AgentMarkSDK, trace, TraceOptions

    # Initialize the SDK
    sdk = AgentMarkSDK(api_key="sk-...", app_id="app_123")
    sdk.init_tracing()

    # Trace an operation
    result = await trace(
        TraceOptions(name="my-operation", user_id="user-1"),
        my_async_function,
    )

    # Submit a score
    await sdk.score(
        resource_id=result.trace_id,
        name="accuracy",
        score=0.95,
    )
"""

from .config import (
    AGENTMARK_KEY,
    AGENTMARK_SCORE_ENDPOINT,
    AGENTMARK_TRACE_ENDPOINT,
    DEFAULT_BASE_URL,
    METADATA_KEY,
)
from .sampler import AgentmarkSampler
from .sdk import AgentMarkSDK
from .trace import TraceContext, TraceOptions, TraceResult, trace, trace_context

__all__ = [
    # SDK
    "AgentMarkSDK",
    # Trace utilities
    "trace",
    "trace_context",
    "TraceOptions",
    "TraceContext",
    "TraceResult",
    # Sampler
    "AgentmarkSampler",
    # Config
    "AGENTMARK_KEY",
    "METADATA_KEY",
    "AGENTMARK_TRACE_ENDPOINT",
    "AGENTMARK_SCORE_ENDPOINT",
    "DEFAULT_BASE_URL",
]

__version__ = "0.1.0"
