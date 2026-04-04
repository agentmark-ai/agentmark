"""Object prompt class."""

import asyncio
import inspect
from typing import Any

from ..schemas import ObjectConfigSchema
from .base import BasePrompt


class ObjectPrompt(BasePrompt[ObjectConfigSchema]):
    """Object prompt for structured outputs."""

    async def format(
        self,
        props: dict[str, Any] | None = None,
        **options: Any,
    ) -> Any:
        """Format the object prompt.

        Args:
            props: Props to pass to the template
            **options: Additional adapter options

        Returns:
            Adapted object prompt output
        """
        compiled = await self._compile(props)
        adapt_options = self._build_adapt_options(options)
        result = self._adapter.adapt_object(compiled, adapt_options, self._metadata(props))
        # Support both sync and async adapters
        if inspect.iscoroutine(result):
            result = await result
        return result

    async def evaluate(
        self,
        input: dict[str, Any],
        output: dict[str, Any] | Any,
        expected_output: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Run registered eval functions against the given output.

        Looks up eval names from test_settings.evals, resolves them
        from the eval registry, and runs each one.

        Args:
            input: The props that were passed to format()
            output: The LLM output (dict or Pydantic model)
            expected_output: Optional ground truth for reference-based evals
            metadata: Optional metadata for eval context

        Returns:
            List of eval results, each with name, score, label, reason, passed
        """
        eval_names = (self._test_settings or {}).get("evals") or []
        if not eval_names or not self._eval_registry:
            return []

        # Convert Pydantic model to dict if needed
        if hasattr(output, "model_dump"):
            output = output.model_dump()

        results: list[dict[str, Any]] = []
        for name in eval_names:
            fn = self._eval_registry.get(name)
            if not fn:
                continue
            params: dict[str, Any] = {
                "input": input,
                "output": output,
                "expectedOutput": expected_output,
            }
            if metadata is not None:
                params["metadata"] = metadata
            result = fn(params)
            if asyncio.iscoroutine(result):
                result = await result
            results.append({"name": name, **result})

        return results
