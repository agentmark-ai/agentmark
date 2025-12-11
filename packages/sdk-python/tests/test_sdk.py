"""Tests for AgentMarkSDK class."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from agentmark_sdk import AgentMarkSDK
from agentmark_sdk.config import DEFAULT_BASE_URL


class TestAgentMarkSDK:
    """Tests for AgentMarkSDK class."""

    def test_init_default_base_url(self) -> None:
        """Test SDK initializes with default base URL."""
        sdk = AgentMarkSDK(api_key="sk-test", app_id="app-123")

        assert sdk.api_key == "sk-test"
        assert sdk.app_id == "app-123"
        assert sdk.base_url == DEFAULT_BASE_URL

    def test_init_custom_base_url(self) -> None:
        """Test SDK initializes with custom base URL."""
        sdk = AgentMarkSDK(
            api_key="sk-test",
            app_id="app-123",
            base_url="https://custom.api.com/",
        )

        assert sdk.base_url == "https://custom.api.com"

    def test_base_url_strips_trailing_slash(self) -> None:
        """Test that base URL strips trailing slash."""
        sdk = AgentMarkSDK(
            api_key="sk-test",
            app_id="app-123",
            base_url="https://api.example.com///",
        )

        assert sdk.base_url == "https://api.example.com"

    @patch("agentmark_sdk.sdk.otel_trace")
    @patch("agentmark_sdk.sdk.OTLPSpanExporter")
    @patch("agentmark_sdk.sdk.BatchSpanProcessor")
    @patch("agentmark_sdk.sdk.TracerProvider")
    def test_init_tracing_creates_provider(
        self,
        mock_provider_class: MagicMock,
        mock_processor_class: MagicMock,
        mock_exporter_class: MagicMock,
        mock_otel_trace: MagicMock,
    ) -> None:
        """Test that init_tracing creates and sets a TracerProvider."""
        mock_provider = MagicMock()
        mock_provider_class.return_value = mock_provider

        sdk = AgentMarkSDK(api_key="sk-test", app_id="app-123")
        result = sdk.init_tracing()

        assert result == mock_provider
        mock_exporter_class.assert_called_once()
        mock_processor_class.assert_called_once()
        mock_provider.add_span_processor.assert_called_once()
        mock_otel_trace.set_tracer_provider.assert_called_once_with(mock_provider)

    @patch("agentmark_sdk.sdk.otel_trace")
    @patch("agentmark_sdk.sdk.OTLPSpanExporter")
    @patch("agentmark_sdk.sdk.SimpleSpanProcessor")
    @patch("agentmark_sdk.sdk.TracerProvider")
    def test_init_tracing_with_disable_batch(
        self,
        mock_provider_class: MagicMock,
        mock_simple_processor_class: MagicMock,
        mock_exporter_class: MagicMock,
        mock_otel_trace: MagicMock,
    ) -> None:
        """Test that init_tracing uses SimpleSpanProcessor when batch is disabled."""
        mock_provider = MagicMock()
        mock_provider_class.return_value = mock_provider

        sdk = AgentMarkSDK(api_key="sk-test", app_id="app-123")
        sdk.init_tracing(disable_batch=True)

        mock_simple_processor_class.assert_called_once()

    @patch("agentmark_sdk.sdk.OTLPSpanExporter")
    def test_init_tracing_exporter_config(
        self, mock_exporter_class: MagicMock
    ) -> None:
        """Test that exporter is configured with correct URL and headers."""
        sdk = AgentMarkSDK(
            api_key="sk-my-api-key",
            app_id="my-app-id",
            base_url="https://api.agentmark.co",
        )

        with patch("agentmark_sdk.sdk.TracerProvider"), patch(
            "agentmark_sdk.sdk.BatchSpanProcessor"
        ), patch("agentmark_sdk.sdk.otel_trace"):
            sdk.init_tracing()

        mock_exporter_class.assert_called_once_with(
            endpoint="https://api.agentmark.co/v1/traces",
            headers={
                "Authorization": "sk-my-api-key",
                "X-Agentmark-App-Id": "my-app-id",
            },
        )


class TestAgentMarkSDKScore:
    """Tests for AgentMarkSDK.score() method."""

    @pytest.mark.asyncio
    async def test_score_success(self) -> None:
        """Test successful score submission."""
        from unittest.mock import AsyncMock

        sdk = AgentMarkSDK(api_key="sk-test", app_id="app-123")

        mock_response = MagicMock()
        mock_response.is_success = True
        mock_response.json.return_value = {"data": {"id": "score-123"}}

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response

        with patch("agentmark_sdk.sdk.httpx.AsyncClient") as mock_client_class:
            mock_client_class.return_value.__aenter__.return_value = mock_client
            mock_client_class.return_value.__aexit__.return_value = None

            result = await sdk.score(
                resource_id="trace-123",
                name="accuracy",
                score=0.95,
                label="good",
                reason="Response was accurate",
            )

            assert result == {"id": "score-123"}

    @pytest.mark.asyncio
    async def test_score_with_minimal_params(self) -> None:
        """Test score with only required parameters."""
        from unittest.mock import AsyncMock

        sdk = AgentMarkSDK(api_key="sk-test", app_id="app-123")

        mock_response = MagicMock()
        mock_response.is_success = True
        mock_response.json.return_value = {"data": {"id": "score-456"}}

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response

        with patch("agentmark_sdk.sdk.httpx.AsyncClient") as mock_client_class:
            mock_client_class.return_value.__aenter__.return_value = mock_client
            mock_client_class.return_value.__aexit__.return_value = None

            result = await sdk.score(
                resource_id="trace-123",
                name="relevance",
                score=0.8,
            )

            assert result == {"id": "score-456"}
            # Verify the post call was made with correct payload
            call_kwargs = mock_client.post.call_args.kwargs
            payload = call_kwargs.get("json", {})
            assert payload["resourceId"] == "trace-123"
            assert payload["name"] == "relevance"
            assert payload["score"] == 0.8
            assert "label" not in payload
            assert "reason" not in payload


class TestAgentMarkSDKScoreSync:
    """Tests for AgentMarkSDK.score_sync() method."""

    def test_score_sync_success(self) -> None:
        """Test successful synchronous score submission."""
        sdk = AgentMarkSDK(api_key="sk-test", app_id="app-123")

        with patch("agentmark_sdk.sdk.httpx.Client") as mock_client_class:
            mock_response = MagicMock()
            mock_response.is_success = True
            mock_response.json.return_value = {"data": {"id": "score-789"}}

            mock_client = MagicMock()
            mock_client.post.return_value = mock_response
            mock_client_class.return_value.__enter__ = lambda self: mock_client
            mock_client_class.return_value.__exit__ = lambda self, *args: None

            result = sdk.score_sync(
                resource_id="trace-123",
                name="accuracy",
                score=0.95,
            )

            assert result == {"id": "score-789"}

    def test_score_sync_error(self) -> None:
        """Test synchronous score submission error handling."""
        sdk = AgentMarkSDK(api_key="sk-test", app_id="app-123")

        with patch("agentmark_sdk.sdk.httpx.Client") as mock_client_class:
            mock_response = MagicMock()
            mock_response.is_success = False
            mock_response.json.return_value = {"error": "Invalid resource ID"}

            mock_client = MagicMock()
            mock_client.post.return_value = mock_response
            mock_client_class.return_value.__enter__ = lambda self: mock_client
            mock_client_class.return_value.__exit__ = lambda self, *args: None

            with pytest.raises(Exception, match="Invalid resource ID"):
                sdk.score_sync(
                    resource_id="invalid",
                    name="accuracy",
                    score=0.95,
                )
