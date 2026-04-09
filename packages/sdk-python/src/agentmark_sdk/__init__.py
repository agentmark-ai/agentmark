"""AgentMark SDK for Python.

Provides OpenTelemetry-based tracing and observability for AI applications.

Example:
    from agentmark_sdk import AgentMarkSDK, span, SpanOptions

    # Initialize the SDK
    sdk = AgentMarkSDK(api_key="sk-...", app_id="app_123")
    sdk.init_tracing()

    # Create a span around an operation
    result = await span(
        SpanOptions(name="my-operation", user_id="user-1"),
        my_async_function,
    )

    # Auto-capture IO with decorator
    from agentmark_sdk import observe, SpanKind

    @observe(kind=SpanKind.TOOL)
    async def my_tool(query: str) -> dict:
        return {"result": "data"}

    # Submit a score
    await sdk.score(
        resource_id=result.trace_id,
        name="accuracy",
        score=0.95,
    )
"""

from importlib.metadata import version as _pkg_version

from .config import (
    AGENTMARK_KEY,
    AGENTMARK_SCORE_ENDPOINT,
    AGENTMARK_TRACE_ENDPOINT,
    DEFAULT_BASE_URL,
    METADATA_KEY,
)
from .decorator import SpanKind, observe
from .masking_processor import MaskFunction, MaskingSpanProcessor
from .pii_masker import CustomPattern, PiiMaskerConfig, create_pii_masker
from .sampler import AgentmarkSampler
from .sdk import AgentMarkSDK
from .serialize import serialize_value
from .trace import SpanContext, SpanOptions, SpanResult, span, span_context, span_context_sync

__all__ = [
    # SDK
    "AgentMarkSDK",
    # Span utilities
    "span",
    "span_context",
    "span_context_sync",
    "observe",
    "SpanOptions",
    "SpanContext",
    "SpanResult",
    # Span kinds
    "SpanKind",
    # Serialization
    "serialize_value",
    # Sampler
    "AgentmarkSampler",
    # Masking
    "MaskFunction",
    "MaskingSpanProcessor",
    "create_pii_masker",
    "PiiMaskerConfig",
    "CustomPattern",
    # Config
    "AGENTMARK_KEY",
    "METADATA_KEY",
    "AGENTMARK_TRACE_ENDPOINT",
    "AGENTMARK_SCORE_ENDPOINT",
    "DEFAULT_BASE_URL",
]

# Read runtime __version__ from installed dist metadata to prevent drift
# against pyproject.toml across releases. See pydantic-ai-v0-adapter for
# the same pattern and rationale.
__version__ = _pkg_version("agentmark-sdk")
