"""Webhook handler for executing AgentMark prompts with Pydantic AI.

This module provides PydanticAIWebhookHandler, which implements the
AgentMark webhook protocol for executing prompts via HTTP. It mirrors
TypeScript's VercelAdapterWebhookHandler for Python/Pydantic AI.

Example:
    from agentmark_pydantic_ai_v0 import create_pydantic_ai_client
    from agentmark_pydantic_ai_v0.webhook import PydanticAIWebhookHandler

    client = create_pydantic_ai_client()
    handler = PydanticAIWebhookHandler(client)

    # Execute a prompt
    result = await handler.run_prompt(prompt_ast, {"shouldStream": False})

    # Run an experiment across a dataset
    result = await handler.run_experiment(prompt_ast, "my-experiment")
    async for chunk in result["stream"]:
        print(chunk)
"""

from __future__ import annotations

import asyncio
import inspect
import json
import uuid
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Any

from agentmark.prompt_core import AgentMark, get_front_matter
from agentmark.prompt_core.types import EvalFunction, EvalParams

from .runner import run_object_prompt, run_text_prompt

if TYPE_CHECKING:
    pass


class PydanticAIWebhookHandler:
    """Webhook handler implementing the AgentMark webhook protocol.

    Mirrors TypeScript's VercelAdapterWebhookHandler for Python/Pydantic AI.
    Supports text prompts, object prompts (structured output), streaming,
    and experiment/dataset runs.

    Example:
        client = create_pydantic_ai_client()
        handler = PydanticAIWebhookHandler(client)

        # Run a prompt
        result = await handler.run_prompt(ast, {"customProps": {"name": "Alice"}})
        print(result["result"])

        # Run an experiment
        result = await handler.run_experiment(ast, "experiment-1")
        async for chunk in result["stream"]:
            print(chunk)
    """

    def __init__(self, client: AgentMark) -> None:
        """Initialize the handler with an AgentMark client.

        Args:
            client: An AgentMark client configured with PydanticAIAdapter.
        """
        self._client = client

    async def run_prompt(
        self,
        prompt_ast: dict[str, Any],
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute a prompt and return the result.

        Args:
            prompt_ast: Compiled AgentMark AST (from templatedx).
            options: Execution options:
                - shouldStream: Whether to stream the response (default True)
                - customProps: Custom props to pass to the prompt
                - telemetry: Telemetry options

        Returns:
            Result dict with:
                - type: "text", "object", or "stream"
                - result: The output (for non-streaming)
                - stream: AsyncIterator[str] (for streaming)
                - usage: Token usage stats
                - finishReason: Why generation stopped
                - traceId: Trace identifier (if telemetry enabled)
        """
        options = options or {}
        frontmatter = get_front_matter(prompt_ast)
        should_stream = options.get("shouldStream", True)
        custom_props = options.get("customProps")

        # Determine prompt type from frontmatter
        if frontmatter.get("object_config"):
            return await self._run_object_prompt(
                prompt_ast, frontmatter, should_stream, custom_props
            )

        if frontmatter.get("text_config"):
            return await self._run_text_prompt(
                prompt_ast, frontmatter, should_stream, custom_props
            )

        raise ValueError("Invalid prompt: no text_config or object_config found")

    async def _run_text_prompt(
        self,
        prompt_ast: dict[str, Any],
        _frontmatter: dict[str, Any],
        should_stream: bool,
        custom_props: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """Execute a text prompt."""
        prompt = await self._client.load_text_prompt(prompt_ast)

        if custom_props:
            params = await prompt.format(props=custom_props)
        else:
            params = await prompt.format_with_test_props()

        if should_stream:
            return {
                "type": "stream",
                "stream": self._stream_text(params),
            }

        result = await run_text_prompt(params)
        return {
            "type": "text",
            "result": result.output,
            "usage": {
                "promptTokens": result.usage.request_tokens or 0,
                "completionTokens": result.usage.response_tokens or 0,
                "totalTokens": result.usage.total_tokens or 0,
            },
            "finishReason": "stop",
        }

    async def _run_object_prompt(
        self,
        prompt_ast: dict[str, Any],
        _frontmatter: dict[str, Any],
        should_stream: bool,
        custom_props: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """Execute an object (structured output) prompt."""
        prompt = await self._client.load_object_prompt(prompt_ast)

        if custom_props:
            params = await prompt.format(props=custom_props)
        else:
            params = await prompt.format_with_test_props()

        if should_stream:
            return {
                "type": "stream",
                "stream": self._stream_object(params),
            }

        result = await run_object_prompt(params)
        output = (
            result.output.model_dump()
            if hasattr(result.output, "model_dump")
            else result.output
        )
        return {
            "type": "object",
            "result": output,
            "usage": {
                "promptTokens": result.usage.request_tokens or 0,
                "completionTokens": result.usage.response_tokens or 0,
                "totalTokens": result.usage.total_tokens or 0,
            },
            "finishReason": "stop",
        }

    async def _stream_text(self, params: Any) -> AsyncIterator[str]:
        """Stream text prompt responses.

        Yields NDJSON chunks matching the webhook protocol.
        """
        from pydantic_ai import Agent

        system_prompt = params.system_prompt if params.system_prompt else ""
        agent: Agent[None, str] = Agent(
            model=params.model,
            system_prompt=system_prompt,
            model_settings=params.model_settings,
            tools=params.tools,
        )

        async with agent.run_stream(params.user_prompt) as result:
            async for text in result.stream_text():
                yield json.dumps({"type": "text", "result": text})

            usage = result.usage()
            yield json.dumps(
                {
                    "type": "text",
                    "finishReason": "stop",
                    "usage": {
                        "promptTokens": usage.request_tokens or 0,
                        "completionTokens": usage.response_tokens or 0,
                        "totalTokens": usage.total_tokens or 0,
                    },
                }
            )

    async def _stream_object(self, params: Any) -> AsyncIterator[str]:
        """Stream object prompt responses.

        Yields NDJSON chunks with partial objects as they are generated.
        """
        from pydantic_ai import Agent

        system_prompt = params.system_prompt if params.system_prompt else ""
        agent: Agent[None, Any] = Agent(
            model=params.model,
            system_prompt=system_prompt,
            model_settings=params.model_settings,
            output_type=params.output_type,
        )

        async with agent.run_stream(params.user_prompt) as result:
            async for partial in result.stream():
                output = (
                    partial.model_dump()
                    if hasattr(partial, "model_dump")
                    else partial
                )
                yield json.dumps({"type": "object", "result": output})

            usage = result.usage()
            yield json.dumps(
                {
                    "type": "object",
                    "usage": {
                        "promptTokens": usage.request_tokens or 0,
                        "completionTokens": usage.response_tokens or 0,
                        "totalTokens": usage.total_tokens or 0,
                    },
                }
            )

    async def run_experiment(
        self,
        prompt_ast: dict[str, Any],
        dataset_run_name: str,
        dataset_path: str | None = None,
    ) -> dict[str, Any]:
        """Run an experiment across a dataset.

        Executes the prompt for each row in the dataset and streams
        results back in NDJSON format.

        Args:
            prompt_ast: Compiled AgentMark AST.
            dataset_run_name: Name for this experiment run.
            dataset_path: Optional path to dataset file. If not provided,
                uses the dataset path from test_settings in the prompt.

        Returns:
            Dict with:
                - stream: AsyncIterator yielding NDJSON result chunks
                - streamHeaders: Headers for the streaming response

        Example:
            result = await handler.run_experiment(ast, "experiment-1")
            async for chunk in result["stream"]:
                data = json.loads(chunk)
                print(f"Input: {data['result']['input']}")
                print(f"Output: {data['result']['actualOutput']}")
        """
        frontmatter = get_front_matter(prompt_ast)
        experiment_run_id = str(uuid.uuid4())
        resolved_dataset_path = (
            dataset_path or frontmatter.get("test_settings", {}).get("dataset")
        )

        return {
            "stream": self._stream_experiment(
                prompt_ast,
                frontmatter,
                experiment_run_id,
                dataset_run_name,
                resolved_dataset_path,
            ),
            "streamHeaders": {"AgentMark-Streaming": "true"},
        }

    async def _stream_experiment(
        self,
        prompt_ast: dict[str, Any],
        frontmatter: dict[str, Any],
        experiment_run_id: str,
        dataset_run_name: str,
        dataset_path: str | None,
    ) -> AsyncIterator[str]:
        """Stream experiment results.

        Yields NDJSON chunks for each dataset item result.
        """
        if frontmatter.get("text_config"):
            async for chunk in self._stream_text_experiment(
                prompt_ast, experiment_run_id, dataset_run_name, dataset_path
            ):
                yield chunk

        elif frontmatter.get("object_config"):
            async for chunk in self._stream_object_experiment(
                prompt_ast, experiment_run_id, dataset_run_name, dataset_path
            ):
                yield chunk

    async def _run_eval(
        self,
        eval_fn: EvalFunction,
        eval_name: str,
        input_data: Any,
        output: Any,
        expected_output: Any | None,
    ) -> dict[str, Any]:
        """Execute an eval function and return standardized result.

        Args:
            eval_fn: The evaluation function to execute.
            eval_name: Name of the eval for the result.
            input_data: The input that was passed to the prompt.
            output: The actual output from the prompt.
            expected_output: The expected output (if any).

        Returns:
            Dict with eval name and result fields (passed, score, reason, etc.)
        """
        params: EvalParams = {
            "input": input_data,
            "output": output,
            "expectedOutput": expected_output,
        }

        # Handle both sync and async eval functions
        if inspect.iscoroutinefunction(eval_fn):
            result = await eval_fn(params)
        else:
            result = eval_fn(params)

        return {"name": eval_name, **result}

    async def _execute_evals(
        self,
        eval_names: list[str],
        input_data: Any,
        output: Any,
        expected_output: Any | None,
    ) -> list[dict[str, Any]]:
        """Execute multiple evals in parallel and return results.

        Matches TypeScript implementation: uses Promise.all() equivalent
        and lets errors propagate.

        Args:
            eval_names: List of eval names to execute.
            input_data: The input that was passed to the prompt.
            output: The actual output from the prompt.
            expected_output: The expected output (if any).

        Returns:
            List of eval result dicts with name and result fields.
        """
        eval_registry = self._client.eval_registry
        if not eval_registry:
            return []

        # Filter to only registered evals (matching TS .filter(Boolean))
        evaluators: list[tuple[str, EvalFunction]] = []
        for eval_name in eval_names:
            eval_fn = eval_registry.get(eval_name)
            if eval_fn:
                evaluators.append((eval_name, eval_fn))

        if not evaluators:
            return []

        # Run all evals in parallel (matching TS Promise.all())
        eval_results = await asyncio.gather(
            *(
                self._run_eval(
                    eval_fn,
                    eval_name,
                    input_data=input_data,
                    output=output,
                    expected_output=expected_output,
                )
                for eval_name, eval_fn in evaluators
            )
        )

        return list(eval_results)

    async def _stream_text_experiment(
        self,
        prompt_ast: dict[str, Any],
        experiment_run_id: str,
        dataset_run_name: str,
        dataset_path: str | None,
    ) -> AsyncIterator[str]:
        """Stream text experiment results."""
        prompt = await self._client.load_text_prompt(prompt_ast)
        dataset = await prompt.format_with_dataset(dataset_path=dataset_path)

        reader = dataset.get_reader()
        while True:
            read_result = await reader.read()
            if read_result.get("done"):
                break

            item = read_result.get("value", {})
            if item.get("type") == "error":
                yield json.dumps(
                    {
                        "type": "error",
                        "error": item.get("error", "Unknown error"),
                        "runId": experiment_run_id,
                        "runName": dataset_run_name,
                    }
                )
                continue

            # Run the formatted prompt
            result = await run_text_prompt(item["formatted"])

            # Execute evals if specified
            eval_names = item.get("evals", [])
            # Pass raw messages to evals (matching TS: formatted?.messages)
            formatted = item["formatted"]
            input_messages = (
                formatted._raw_messages
                if hasattr(formatted, "_raw_messages")
                else formatted.user_prompt
            )
            eval_results = await self._execute_evals(
                eval_names=eval_names,
                input_data=input_messages,
                output=result.output,
                expected_output=item["dataset"].get("expected_output"),
            )

            yield json.dumps(
                {
                    "type": "dataset",
                    "result": {
                        "input": item["dataset"].get("input"),
                        "expectedOutput": item["dataset"].get("expected_output"),
                        "actualOutput": result.output,
                        "tokens": result.usage.total_tokens or 0,
                        "evals": eval_results,
                    },
                    "runId": experiment_run_id,
                    "runName": dataset_run_name,
                }
            )

    async def _stream_object_experiment(
        self,
        prompt_ast: dict[str, Any],
        experiment_run_id: str,
        dataset_run_name: str,
        dataset_path: str | None,
    ) -> AsyncIterator[str]:
        """Stream object experiment results."""
        prompt = await self._client.load_object_prompt(prompt_ast)
        dataset = await prompt.format_with_dataset(dataset_path=dataset_path)

        reader = dataset.get_reader()
        while True:
            read_result = await reader.read()
            if read_result.get("done"):
                break

            item = read_result.get("value", {})
            if item.get("type") == "error":
                yield json.dumps(
                    {
                        "type": "error",
                        "error": item.get("error", "Unknown error"),
                        "runId": experiment_run_id,
                        "runName": dataset_run_name,
                    }
                )
                continue

            # Run the formatted prompt
            result = await run_object_prompt(item["formatted"])
            output = (
                result.output.model_dump()
                if hasattr(result.output, "model_dump")
                else result.output
            )

            # Execute evals if specified
            eval_names = item.get("evals", [])
            # Pass raw messages to evals (matching TS: item.formatted.messages)
            formatted = item["formatted"]
            input_messages = (
                formatted._raw_messages
                if hasattr(formatted, "_raw_messages")
                else formatted.user_prompt
            )
            eval_results = await self._execute_evals(
                eval_names=eval_names,
                input_data=input_messages,
                output=output,
                expected_output=item["dataset"].get("expected_output"),
            )

            yield json.dumps(
                {
                    "type": "dataset",
                    "result": {
                        "input": item["dataset"].get("input"),
                        "expectedOutput": item["dataset"].get("expected_output"),
                        "actualOutput": output,
                        "tokens": result.usage.total_tokens or 0,
                        "evals": eval_results,
                    },
                    "runId": experiment_run_id,
                    "runName": dataset_run_name,
                }
            )
