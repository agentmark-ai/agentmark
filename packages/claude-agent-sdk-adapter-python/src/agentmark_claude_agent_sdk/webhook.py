"""Webhook handler for Claude Agent SDK adapter.

Ported from TypeScript: packages/claude-agent-sdk-adapter/src/runner.ts
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any

from .traced import generate_fallback_trace_id


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

    def __init__(self, client: Any, *, mcp_servers: dict[str, Any] | None = None) -> None:
        """Initialize the handler.

        Args:
            client: AgentMark client configured with ClaudeAgentAdapter.
            mcp_servers: Optional default MCP servers to include in every query.
        """
        self._client = client
        self._default_mcp_servers = mcp_servers or {}

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

        return await self._run_with_tracing(adapted, output_type, should_stream)

    async def _run_with_tracing(
        self,
        adapted: Any,
        output_type: str,
        should_stream: bool,
    ) -> WebhookResult | StreamingResult:
        """Run prompt execution with automatic OTEL tracing via traced_query.

        Mirrors the TypeScript runner pattern:
            const tracedResult = await withTracing(query, adapted);

        traced_query handles SDK execution and OTEL tracing transparently.
        """
        from .traced import traced_query

        mcp_servers = self._default_mcp_servers or None
        trace_id = generate_fallback_trace_id()

        if should_stream:
            async def stream_generator() -> AsyncGenerator[bytes, None]:
                input_tokens = 0
                output_tokens = 0
                final_result = ""
                structured_output: Any = None
                finish_reason = "stop"

                try:
                    async for message in traced_query(adapted, default_mcp_servers=mcp_servers):
                        msg_type = type(message).__name__

                        if msg_type == "AssistantMessage":
                            content = getattr(message, "content", [])
                            for block in (content or []):
                                text = block.get("text", "") if isinstance(block, dict) else getattr(block, "text", "")
                                if text:
                                    chunk = json.dumps({"type": output_type, "delta": text})
                                    yield (chunk + "\n").encode()

                        elif msg_type == "ResultMessage":
                            subtype = getattr(message, "subtype", "")
                            if subtype == "success":
                                final_result = getattr(message, "result", "") or ""
                                structured_output = getattr(message, "structured_output", None)
                                usage = getattr(message, "usage", {}) or {}
                                input_tokens = usage.get("input_tokens", 0)
                                output_tokens = usage.get("output_tokens", 0)
                            else:
                                finish_reason = "error"
                                error_msg = f"Error: {subtype}"
                                chunk = json.dumps({"type": "error", "error": error_msg})
                                yield (chunk + "\n").encode()

                    result_value = structured_output if output_type == "object" else final_result
                    final_chunk = json.dumps({
                        "type": output_type,
                        "result": result_value,
                        "finishReason": finish_reason,
                        "usage": {"promptTokens": input_tokens, "completionTokens": output_tokens},
                    })
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

        # Non-streaming
        input_tokens = 0
        output_tokens = 0
        final_result: Any = ""
        structured_output: Any = None
        finish_reason = "stop"

        try:
            async for message in traced_query(adapted, default_mcp_servers=mcp_servers):
                msg_type = type(message).__name__

                if msg_type == "ResultMessage":
                    subtype = getattr(message, "subtype", "")
                    if subtype == "success":
                        final_result = getattr(message, "result", "") or ""
                        structured_output = getattr(message, "structured_output", None)
                        usage = getattr(message, "usage", {}) or {}
                        input_tokens = usage.get("input_tokens", 0)
                        output_tokens = usage.get("output_tokens", 0)
                    else:
                        finish_reason = "error"
                        final_result = f"Error: {subtype}"

            result_value = final_result if finish_reason == "error" else (
                structured_output if output_type == "object" else final_result
            )

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
            import traceback
            traceback.print_exc()
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
        sampling: dict[str, Any] | None = None,
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
        mcp_servers = self._default_mcp_servers or None
        run_id = experiment_run_id
        run_name = dataset_run_name
        prompt_name = frontmatter.get("name")
        is_object_prompt = bool(frontmatter.get("object_config"))
        sampling_opts = sampling

        async def experiment_stream() -> AsyncGenerator[bytes, None]:
            from .traced import traced_query

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
                    sampling=sampling_opts,
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
                        async for message in traced_query(adapted, default_mcp_servers=mcp_servers):
                            msg_type = type(message).__name__
                            if msg_type == "ResultMessage" and getattr(message, "subtype", "") == "success":
                                result = getattr(message, "result", "") or ""
                                structured_output = getattr(message, "structured_output", None)
                                usage = getattr(message, "usage", {}) or {}
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
]
