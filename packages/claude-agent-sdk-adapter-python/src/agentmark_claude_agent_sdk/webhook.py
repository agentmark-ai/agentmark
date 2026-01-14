"""Webhook handler for Claude Agent SDK adapter.

Ported from TypeScript: packages/claude-agent-sdk-adapter/src/runner.ts
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any, TypeVar

T = TypeVar("T")


@dataclass
class WebhookResult:
    """Result from running a prompt (non-streaming)."""

    type: str
    """Type of result: "text" or "object"."""

    result: Any
    """The result content (string for text, dict for object)."""

    usage: dict[str, int]
    """Token usage: promptTokens, completionTokens, totalTokens."""

    finish_reason: str
    """Finish reason: "stop" or "error"."""

    trace_id: str
    """Trace ID for telemetry."""


@dataclass
class StreamingResult:
    """Result from running a streaming prompt."""

    type: str = "stream"
    """Type is always "stream"."""

    stream: AsyncGenerator[bytes, None] | None = None
    """Async generator yielding stream chunks."""

    stream_header: dict[str, str] = field(default_factory=lambda: {"AgentMark-Streaming": "true"})
    """HTTP headers for streaming response."""

    trace_id: str = ""
    """Trace ID for telemetry."""


@dataclass
class ExperimentResult:
    """Result from running an experiment."""

    stream: AsyncGenerator[bytes, None] | None = None
    """Async generator yielding experiment events."""

    stream_headers: dict[str, str] = field(default_factory=lambda: {"AgentMark-Streaming": "true"})
    """HTTP headers for streaming response."""


def generate_fallback_trace_id() -> str:
    """Generate a fallback trace ID when OTEL is not available.

    Uses UUID format without hyphens (32 hex chars).
    """
    return uuid.uuid4().hex


def get_otel_api() -> Any | None:
    """Get OpenTelemetry API if available."""
    try:
        from opentelemetry import trace

        return trace
    except ImportError:
        return None


class ClaudeAgentWebhookHandler:
    """Webhook handler for Claude Agent SDK adapter.

    Implements the WebhookHandler interface used by the AgentMark CLI
    to execute prompts with the Claude Agent SDK and return results.

    Example:
        from agentmark_claude_agent_sdk import ClaudeAgentWebhookHandler

        handler = ClaudeAgentWebhookHandler(client)

        # Execute a prompt and get results
        result = await handler.run_prompt(ast, custom_props={"task": "Help me"})
    """

    def __init__(self, client: Any) -> None:
        """Initialize the handler.

        Args:
            client: AgentMark client configured with ClaudeAgentAdapter.
        """
        self._client = client

    def _get_frontmatter(self, prompt_ast: dict[str, Any]) -> dict[str, Any]:
        """Get frontmatter from prompt AST.

        Args:
            prompt_ast: The parsed prompt AST.

        Returns:
            Frontmatter dictionary.
        """
        # Try to use templatedx getFrontMatter if available
        try:
            from agentmark_templatedx import get_front_matter

            return get_front_matter(prompt_ast) or {}
        except ImportError:
            pass

        # Fallback: extract from AST structure
        if not isinstance(prompt_ast, dict):
            return {}

        # Check for frontmatter in various locations
        if "frontmatter" in prompt_ast:
            return prompt_ast["frontmatter"]

        # Look for yaml/frontmatter child nodes
        children = prompt_ast.get("children", [])
        for child in children:
            if isinstance(child, dict) and child.get("type") == "yaml" and "value" in child:
                try:
                    import yaml

                    return yaml.safe_load(child["value"]) or {}
                except Exception:
                    return {}

        return {}

    async def _execute_query(
        self, adapted: Any, _output_type: str = "text"
    ) -> list[dict[str, Any]]:
        """Execute query and collect all results.

        Args:
            adapted: Adapted prompt parameters.
            _output_type: Expected output type (unused, for interface consistency).

        Returns:
            List of message results from query.
        """
        # Try to import and use claude-agent-sdk
        try:
            from claude_agent_sdk import query
        except ImportError:
            # Return mock result for testing
            return [{"type": "result", "subtype": "success", "result": "Mock result"}]

        results = []
        options_dict = self._adapted_to_options(adapted)

        async for message in query(prompt=adapted.query.prompt, options=options_dict):
            results.append(message)

        return results

    async def _stream_query(
        self, adapted: Any, _output_type: str = "text"
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Stream query results.

        Args:
            adapted: Adapted prompt parameters.
            _output_type: Expected output type (unused, for interface consistency).

        Yields:
            Message results from query.
        """
        # Try to import and use claude-agent-sdk
        try:
            from claude_agent_sdk import query
        except ImportError:
            # Yield mock result for testing
            yield {"type": "result", "subtype": "success", "result": "Mock result"}
            return

        options_dict = self._adapted_to_options(adapted)

        async for message in query(prompt=adapted.query.prompt, options=options_dict):
            yield message

    def _adapted_to_options(self, adapted: Any) -> dict[str, Any]:
        """Convert adapted params to query options dict.

        Args:
            adapted: Adapted prompt parameters.

        Returns:
            Options dictionary for Claude Agent SDK query.
        """
        options = adapted.query.options
        result: dict[str, Any] = {}

        if hasattr(options, "model") and options.model:
            result["model"] = options.model
        if hasattr(options, "max_thinking_tokens") and options.max_thinking_tokens:
            result["max_thinking_tokens"] = options.max_thinking_tokens
        if hasattr(options, "max_turns") and options.max_turns:
            result["max_turns"] = options.max_turns
        if hasattr(options, "permission_mode") and options.permission_mode:
            result["permission_mode"] = options.permission_mode
        if hasattr(options, "cwd") and options.cwd:
            result["cwd"] = options.cwd
        if hasattr(options, "system_prompt") and options.system_prompt:
            result["system_prompt"] = options.system_prompt
        if hasattr(options, "output_format") and options.output_format:
            result["output_format"] = {
                "type": options.output_format.type,
                "schema": options.output_format.schema,
            }
        if hasattr(options, "mcp_servers") and options.mcp_servers:
            result["mcp_servers"] = options.mcp_servers
        if hasattr(options, "hooks") and options.hooks:
            result["hooks"] = options.hooks

        return result

    async def run_prompt(
        self,
        prompt_ast: dict[str, Any],
        *,
        should_stream: bool = False,
        custom_props: dict[str, Any] | None = None,
        telemetry: dict[str, Any] | None = None,
    ) -> WebhookResult | StreamingResult:
        """Run a prompt and return the response.

        Args:
            prompt_ast: The parsed prompt AST.
            should_stream: Whether to stream the response.
            custom_props: Custom props to pass to the prompt.
            telemetry: Telemetry configuration.

        Returns:
            WebhookResult or StreamingResult depending on should_stream.
        """
        frontmatter = self._get_frontmatter(prompt_ast)
        telemetry_config = telemetry or {}

        # Check for unsupported prompt types
        # Note: Use 'in' for key presence check since empty dicts are falsy in Python
        if "image_config" in frontmatter:
            return WebhookResult(
                type="text",
                result="Error: Image generation is not supported by Claude Agent SDK. "
                "Use the Vercel AI SDK adapter with an image model.",
                usage={"promptTokens": 0, "completionTokens": 0, "totalTokens": 0},
                finish_reason="error",
                trace_id="",
            )

        if "speech_config" in frontmatter:
            return WebhookResult(
                type="text",
                result="Error: Speech generation is not supported by Claude Agent SDK. "
                "Use the Vercel AI SDK adapter with a speech model.",
                usage={"promptTokens": 0, "completionTokens": 0, "totalTokens": 0},
                finish_reason="error",
                trace_id="",
            )

        # Determine output type
        is_object_prompt = "object_config" in frontmatter
        output_type = "object" if is_object_prompt else "text"

        # Check for unrecognized config types
        if "text_config" not in frontmatter and "object_config" not in frontmatter:
            raise ValueError(
                "Invalid prompt: No recognized config type "
                "(text_config, object_config, image_config, speech_config)"
            )

        # Load the appropriate prompt type
        if is_object_prompt:
            prompt = await self._client.load_object_prompt(prompt_ast)
        else:
            prompt = await self._client.load_text_prompt(prompt_ast)

        # Format with props or test props
        if custom_props:
            adapted = await prompt.format(props=custom_props, telemetry=telemetry_config)
        else:
            adapted = await prompt.format_with_test_props(telemetry=telemetry_config)

        # Generate trace ID
        trace_id = generate_fallback_trace_id()

        if should_stream:
            return await self._create_streaming_response(adapted, output_type, trace_id)

        return await self._create_non_streaming_response(adapted, output_type, trace_id)

    async def _create_streaming_response(
        self, adapted: Any, output_type: str, trace_id: str
    ) -> StreamingResult:
        """Create a streaming response.

        Args:
            adapted: Adapted prompt parameters.
            output_type: Expected output type.
            trace_id: Trace ID for telemetry.

        Returns:
            StreamingResult with async generator.
        """

        async def stream_generator() -> AsyncGenerator[bytes, None]:
            input_tokens = 0
            output_tokens = 0
            final_result = ""
            structured_output: Any = None

            try:
                async for message in self._stream_query(adapted, output_type):
                    # Handle different message types
                    if message.get("type") == "assistant":
                        msg_content = message.get("message", {}).get("content", [])
                        for block in msg_content:
                            if block.get("type") == "text":
                                chunk = json.dumps(
                                    {"type": output_type, "delta": block.get("text", "")}
                                )
                                yield (chunk + "\n").encode()

                    elif message.get("type") == "result":
                        if message.get("subtype") == "success":
                            final_result = message.get("result", "")
                            structured_output = message.get("structured_output")
                            usage = message.get("usage", {})
                            input_tokens = usage.get("input_tokens", 0)
                            output_tokens = usage.get("output_tokens", 0)
                        else:
                            # Handle error subtypes
                            errors = message.get("errors", [])
                            error_msg = (
                                ", ".join(errors) if errors else f"Error: {message.get('subtype')}"
                            )
                            chunk = json.dumps({"type": "error", "error": error_msg})
                            yield (chunk + "\n").encode()

                # Emit final completion message
                result_value = structured_output if output_type == "object" else final_result
                final_chunk = json.dumps(
                    {
                        "type": output_type,
                        "result": result_value,
                        "finishReason": "stop",
                        "usage": {
                            "promptTokens": input_tokens,
                            "completionTokens": output_tokens,
                        },
                    }
                )
                yield (final_chunk + "\n").encode()

            except Exception as e:
                error_chunk = json.dumps({"type": "error", "error": str(e)})
                yield (error_chunk + "\n").encode()

        return StreamingResult(
            type="stream",
            stream=stream_generator(),
            stream_header={"AgentMark-Streaming": "true"},
            trace_id=trace_id,
        )

    async def _create_non_streaming_response(
        self, adapted: Any, output_type: str, trace_id: str
    ) -> WebhookResult:
        """Create a non-streaming response.

        Args:
            adapted: Adapted prompt parameters.
            output_type: Expected output type.
            trace_id: Trace ID for telemetry.

        Returns:
            WebhookResult with complete response.
        """
        input_tokens = 0
        output_tokens = 0
        final_result: Any = ""
        structured_output: Any = None
        finish_reason = "stop"

        try:
            results = await self._execute_query(adapted, output_type)

            for message in results:
                if message.get("type") == "result":
                    if message.get("subtype") == "success":
                        final_result = message.get("result", "")
                        structured_output = message.get("structured_output")
                        usage = message.get("usage", {})
                        input_tokens = usage.get("input_tokens", 0)
                        output_tokens = usage.get("output_tokens", 0)
                    else:
                        # Handle error subtypes
                        errors = message.get("errors", [])
                        finish_reason = "error"
                        final_result = (
                            ", ".join(errors) if errors else f"Error: {message.get('subtype')}"
                        )

            # For errors, always use final_result (the error message), not structured_output
            if finish_reason == "error":
                result_value = final_result
            else:
                result_value = structured_output if output_type == "object" else final_result

            return WebhookResult(
                type=output_type,
                result=result_value,
                usage={
                    "promptTokens": input_tokens,
                    "completionTokens": output_tokens,
                    "totalTokens": input_tokens + output_tokens,
                },
                finish_reason=finish_reason,
                trace_id=trace_id,
            )

        except Exception as e:
            return WebhookResult(
                type=output_type,
                result=f"Error: {str(e)}",
                usage={"promptTokens": 0, "completionTokens": 0, "totalTokens": 0},
                finish_reason="error",
                trace_id=trace_id,
            )

    async def run_experiment(
        self,
        prompt_ast: dict[str, Any],
        dataset_run_name: str,
        dataset_path: str | None = None,
    ) -> ExperimentResult:
        """Run an experiment against a dataset.

        Args:
            prompt_ast: The parsed prompt AST.
            dataset_run_name: Name for this experiment run.
            dataset_path: Optional override path to dataset.

        Returns:
            ExperimentResult with streaming dataset results.
        """
        frontmatter = self._get_frontmatter(prompt_ast)
        experiment_run_id = str(uuid.uuid4())

        # Check for unsupported types
        if frontmatter.get("image_config") or frontmatter.get("speech_config"):

            async def error_stream() -> AsyncGenerator[bytes, None]:
                chunk = json.dumps(
                    {
                        "type": "error",
                        "error": "Image and speech prompts are not supported by Claude Agent SDK",
                    }
                )
                yield (chunk + "\n").encode()

            return ExperimentResult(
                stream=error_stream(),
                stream_headers={"AgentMark-Streaming": "true"},
            )

        resolved_dataset_path = dataset_path or frontmatter.get("test_settings", {}).get("dataset")

        if not resolved_dataset_path:

            async def no_dataset_stream() -> AsyncGenerator[bytes, None]:
                chunk = json.dumps(
                    {
                        "type": "error",
                        "error": "No dataset path provided and no default dataset in prompt frontmatter",
                    }
                )
                yield (chunk + "\n").encode()

            return ExperimentResult(
                stream=no_dataset_stream(),
                stream_headers={"AgentMark-Streaming": "true"},
            )

        # Create experiment stream
        client = self._client
        run_id = experiment_run_id
        run_name = dataset_run_name
        prompt_name = frontmatter.get("name")
        is_object_prompt = bool(frontmatter.get("object_config"))

        async def experiment_stream() -> AsyncGenerator[bytes, None]:
            # Emit experiment metadata
            start_chunk = json.dumps(
                {
                    "type": "experiment_start",
                    "runId": run_id,
                    "runName": run_name,
                    "datasetPath": resolved_dataset_path,
                    "promptName": prompt_name,
                }
            )
            yield (start_chunk + "\n").encode()

            try:
                # Load the prompt
                if is_object_prompt:
                    prompt = await client.load_object_prompt(prompt_ast)
                else:
                    prompt = await client.load_text_prompt(prompt_ast)

                # Get eval registry
                eval_registry = client.get_eval_registry()

                # Format with dataset
                dataset = await prompt.format_with_dataset(
                    dataset_path=resolved_dataset_path,
                    telemetry={"isEnabled": True},
                )

                item_index = 0

                async for item in dataset:
                    # Check if this is an error chunk
                    if "error" in item:
                        error_chunk = json.dumps(
                            {
                                "type": "experiment_item_error",
                                "index": item_index,
                                "error": item["error"],
                            }
                        )
                        yield (error_chunk + "\n").encode()
                        item_index += 1
                        continue

                    # This is a valid data chunk
                    adapted = item.get("formatted")
                    dataset_item = item.get("dataset", {})
                    evals = item.get("evals", [])

                    result = ""
                    structured_output: Any = None
                    input_tokens = 0
                    output_tokens = 0
                    item_trace_id = generate_fallback_trace_id()

                    try:
                        # Execute query for this dataset item
                        async for message in self._stream_query(
                            adapted, "object" if is_object_prompt else "text"
                        ):
                            if (
                                message.get("type") == "result"
                                and message.get("subtype") == "success"
                            ):
                                result = message.get("result", "")
                                structured_output = message.get("structured_output")
                                usage = message.get("usage", {})
                                input_tokens = usage.get("input_tokens", 0)
                                output_tokens = usage.get("output_tokens", 0)

                        # Determine actual output
                        actual_output = structured_output if is_object_prompt else result

                        # Run evals if configured
                        eval_results: list[dict[str, Any]] = []
                        if eval_registry and evals:
                            for eval_name in evals:
                                eval_fn = eval_registry.get(eval_name)
                                if eval_fn:
                                    try:
                                        eval_result = await eval_fn(
                                            input=adapted.messages
                                            if hasattr(adapted, "messages")
                                            else [],
                                            output=actual_output,
                                            expected_output=dataset_item.get("expected_output"),
                                        )
                                        eval_results.append({"name": eval_name, **eval_result})
                                    except Exception:
                                        pass

                        # Emit dataset result
                        result_chunk = json.dumps(
                            {
                                "type": "dataset",
                                "result": {
                                    "input": dataset_item.get("input"),
                                    "expectedOutput": dataset_item.get("expected_output"),
                                    "actualOutput": actual_output,
                                    "tokens": input_tokens + output_tokens,
                                    "evals": eval_results,
                                },
                                "traceId": item_trace_id,
                                "runId": run_id,
                                "runName": run_name,
                            }
                        )
                        yield (result_chunk + "\n").encode()

                    except Exception as e:
                        error_chunk = json.dumps(
                            {
                                "type": "experiment_item_error",
                                "index": item_index,
                                "input": dataset_item.get("input"),
                                "error": str(e),
                            }
                        )
                        yield (error_chunk + "\n").encode()

                    item_index += 1

                # Emit completion event
                end_chunk = json.dumps({"type": "experiment_end", "totalItems": item_index})
                yield (end_chunk + "\n").encode()

            except Exception as e:
                error_chunk = json.dumps({"type": "error", "error": str(e)})
                yield (error_chunk + "\n").encode()

        return ExperimentResult(
            stream=experiment_stream(),
            stream_headers={"AgentMark-Streaming": "true"},
        )


__all__ = [
    "ClaudeAgentWebhookHandler",
    "WebhookResult",
    "StreamingResult",
    "ExperimentResult",
    "generate_fallback_trace_id",
]
