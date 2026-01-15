"""Tests for ClaudeAgentModelRegistry.

Ported from TypeScript: packages/claude-agent-sdk-adapter/test/agentmark.test.ts
"""

from __future__ import annotations

import re

import pytest

from agentmark_claude_agent_sdk.model_registry import (
    ClaudeAgentModelRegistry,
    ModelConfig,
    create_default_model_registry,
)


class TestClaudeAgentModelRegistry:
    """Test suite for ClaudeAgentModelRegistry."""

    def test_creates_default_registry_passing_model_names_through(self) -> None:
        """Default registry should pass model names through unchanged."""
        registry = create_default_model_registry()
        config = registry.get_model_config("claude-sonnet-4-20250514")

        assert config == ModelConfig(model="claude-sonnet-4-20250514")

    def test_registers_models_with_exact_string_match(self) -> None:
        """Should register models with exact string match."""
        registry = ClaudeAgentModelRegistry().register_models(
            "claude-opus-4-20250514",
            lambda name, _: ModelConfig(model=name, max_thinking_tokens=10000),
        )

        config = registry.get_model_config("claude-opus-4-20250514")
        assert config == ModelConfig(
            model="claude-opus-4-20250514",
            max_thinking_tokens=10000,
        )

    def test_registers_models_with_regex_patterns(self) -> None:
        """Should register models with regex pattern."""
        registry = ClaudeAgentModelRegistry().register_models(
            re.compile(r"claude-.*-thinking"),
            lambda name, _: ModelConfig(model=name, max_thinking_tokens=20000),
        )

        config = registry.get_model_config("claude-sonnet-thinking")
        assert config == ModelConfig(
            model="claude-sonnet-thinking",
            max_thinking_tokens=20000,
        )

    def test_registers_multiple_models_with_arrays(self) -> None:
        """Should register multiple models with array of names."""
        registry = ClaudeAgentModelRegistry().register_models(
            ["claude-sonnet-4-20250514", "claude-haiku-4-20250514"],
            lambda name, _: ModelConfig(model=name),
        )

        assert registry.has_model("claude-sonnet-4-20250514") is True
        assert registry.has_model("claude-haiku-4-20250514") is True

    def test_falls_back_to_default_creator_for_unknown_models(self) -> None:
        """Should fall back to default creator for unknown models."""
        registry = ClaudeAgentModelRegistry(default_creator=lambda name, _: ModelConfig(model=name))

        config = registry.get_model_config("unknown-model")
        assert config == ModelConfig(model="unknown-model")

    def test_throws_error_when_no_matching_config_and_no_default(self) -> None:
        """Should raise error when no matching configuration and no default."""
        registry = ClaudeAgentModelRegistry()
        # Remove the default creator
        registry._default_creator = None  # type: ignore[attr-defined]

        with pytest.raises(ValueError, match=r"No model configuration found"):
            registry.get_model_config("unknown-model")

    def test_prioritizes_exact_match_over_pattern_match(self) -> None:
        """Should prioritize exact match over pattern match."""
        registry = (
            ClaudeAgentModelRegistry()
            .register_models(
                re.compile(r"claude-.*"),
                lambda _name, _: ModelConfig(model="pattern-match", max_thinking_tokens=1000),
            )
            .register_models(
                "claude-opus-4-20250514",
                lambda _name, _: ModelConfig(
                    model="claude-opus-4-20250514", max_thinking_tokens=50000
                ),
            )
        )

        config = registry.get_model_config("claude-opus-4-20250514")
        # Exact match should win
        assert config.max_thinking_tokens == 50000

    def test_uses_first_matching_pattern_when_multiple_match(self) -> None:
        """Should use first matching pattern when multiple patterns match."""
        registry = (
            ClaudeAgentModelRegistry()
            .register_models(
                re.compile(r"claude-.*"),
                lambda _name, _: ModelConfig(model="first-pattern"),
            )
            .register_models(
                re.compile(r"claude-sonnet.*"),
                lambda _name, _: ModelConfig(model="second-pattern"),
            )
        )

        config = registry.get_model_config("claude-sonnet-4-20250514")
        # First registered pattern should win
        assert config.model == "first-pattern"

    def test_handles_regex_flags_case_insensitive(self) -> None:
        """Should handle regex with flags (case-insensitive)."""
        registry = ClaudeAgentModelRegistry().register_models(
            re.compile(r"CLAUDE-.*", re.IGNORECASE),
            lambda name, _: ModelConfig(model=name, max_thinking_tokens=5000),
        )

        config = registry.get_model_config("claude-sonnet-4-20250514")
        assert config.model == "claude-sonnet-4-20250514"
        assert config.max_thinking_tokens == 5000

    def test_passes_model_name_to_creator_function(self) -> None:
        """Should pass model name to creator function."""

        def creator(name: str, _options: dict | None) -> ModelConfig:
            return ModelConfig(model=name.upper())

        registry = ClaudeAgentModelRegistry().register_models("test-model", creator)

        config = registry.get_model_config("test-model")
        assert config.model == "TEST-MODEL"
