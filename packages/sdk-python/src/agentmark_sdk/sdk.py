"""AgentMark SDK main class."""

from __future__ import annotations

from typing import Any

import httpx
from opentelemetry import trace as otel_trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor

from .config import (
    AGENTMARK_SCORE_ENDPOINT,
    AGENTMARK_TRACE_ENDPOINT,
    DEFAULT_BASE_URL,
)
from .sampler import AgentmarkSampler


class AgentMarkSDK:
    """AgentMark SDK for Python.

    Provides OpenTelemetry tracing initialization and score submission.

    Example:
        sdk = AgentMarkSDK(api_key="sk-...", app_id="app_123")
        sdk.init_tracing()

        # Use trace() function from the SDK
        from agentmark_sdk import trace, TraceOptions
        result = await trace(
            TraceOptions(name="my-operation"),
            my_async_function,
        )

        # Submit a score
        await sdk.score(
            resource_id=result.trace_id,
            name="accuracy",
            score=0.95,
            label="good",
            reason="Response matched expected output",
        )
    """

    def __init__(
        self,
        api_key: str,
        app_id: str,
        base_url: str = DEFAULT_BASE_URL,
    ) -> None:
        """Initialize the SDK.

        Args:
            api_key: AgentMark API key.
            app_id: AgentMark application ID.
            base_url: Base URL for the AgentMark API.
        """
        self._api_key = api_key
        self._app_id = app_id
        self._base_url = base_url.rstrip("/")
        self._tracer_provider: TracerProvider | None = None

    @property
    def api_key(self) -> str:
        """Get the API key."""
        return self._api_key

    @property
    def app_id(self) -> str:
        """Get the application ID."""
        return self._app_id

    @property
    def base_url(self) -> str:
        """Get the base URL."""
        return self._base_url

    def init_tracing(self, disable_batch: bool = False) -> TracerProvider:
        """Initialize OpenTelemetry tracing with AgentMark exporter.

        Call this once at application startup.

        Args:
            disable_batch: If True, use SimpleSpanProcessor (immediate export).
                If False (default), use BatchSpanProcessor for better performance.

        Returns:
            The configured TracerProvider.

        Example:
            sdk = AgentMarkSDK(api_key="sk-...", app_id="app_123")
            provider = sdk.init_tracing()
        """
        exporter_url = f"{self._base_url}/{AGENTMARK_TRACE_ENDPOINT}"

        exporter = OTLPSpanExporter(
            endpoint=exporter_url,
            headers={
                "Authorization": self._api_key,
                "X-Agentmark-App-Id": self._app_id,
            },
        )

        processor: SimpleSpanProcessor | BatchSpanProcessor
        if disable_batch:
            processor = SimpleSpanProcessor(exporter)
        else:
            processor = BatchSpanProcessor(exporter)

        resource = Resource.create(
            {
                "service.name": "agentmark-client",
                "agentmark.app_id": self._app_id,
            }
        )

        provider = TracerProvider(
            resource=resource,
            sampler=AgentmarkSampler(),
        )
        provider.add_span_processor(processor)

        otel_trace.set_tracer_provider(provider)
        self._tracer_provider = provider

        return provider

    async def score(
        self,
        resource_id: str,
        name: str,
        score: float,
        label: str | None = None,
        reason: str | None = None,
        type: str | None = None,
    ) -> dict[str, Any]:
        """Submit a score for a trace/span.

        Args:
            resource_id: The trace or span ID to score.
            name: Name of the score metric (e.g., "accuracy", "relevance").
            score: Numeric score value (typically 0.0-1.0).
            label: Optional label (e.g., "good", "bad", "neutral").
            reason: Optional explanation for the score.
            type: Optional score type identifier.

        Returns:
            Response data from the API.

        Raises:
            Exception: If the API request fails.

        Example:
            await sdk.score(
                resource_id="abc123",
                name="accuracy",
                score=0.95,
                label="good",
                reason="Response matched expected",
            )
        """
        url = f"{self._base_url}/{AGENTMARK_SCORE_ENDPOINT}"

        payload: dict[str, Any] = {
            "resourceId": resource_id,
            "name": name,
            "score": score,
        }
        if label is not None:
            payload["label"] = label
        if reason is not None:
            payload["reason"] = reason
        if type is not None:
            payload["type"] = type

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": self._api_key,
                    "X-Agentmark-App-Id": self._app_id,
                },
            )

            if response.is_success:
                data = response.json()
                return data.get("data", {})

            error_data = response.json()
            raise Exception(error_data.get("error", "Unknown error"))

    def score_sync(
        self,
        resource_id: str,
        name: str,
        score: float,
        label: str | None = None,
        reason: str | None = None,
        type: str | None = None,
    ) -> dict[str, Any]:
        """Submit a score for a trace/span (synchronous version).

        Args:
            resource_id: The trace or span ID to score.
            name: Name of the score metric.
            score: Numeric score value.
            label: Optional label.
            reason: Optional explanation.
            type: Optional score type.

        Returns:
            Response data from the API.

        Raises:
            Exception: If the API request fails.
        """
        url = f"{self._base_url}/{AGENTMARK_SCORE_ENDPOINT}"

        payload: dict[str, Any] = {
            "resourceId": resource_id,
            "name": name,
            "score": score,
        }
        if label is not None:
            payload["label"] = label
        if reason is not None:
            payload["reason"] = reason
        if type is not None:
            payload["type"] = type

        with httpx.Client() as client:
            response = client.post(
                url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": self._api_key,
                    "X-Agentmark-App-Id": self._app_id,
                },
            )

            if response.is_success:
                data = response.json()
                return data.get("data", {})

            error_data = response.json()
            raise Exception(error_data.get("error", "Unknown error"))
