"""Base prompt class."""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

from ..types import (
    AdaptOptions,
    DatasetStream,
    FormatWithDatasetOptions,
    Loader,
    PromptMetadata,
    TemplateEngine,
    TestSettings,
)

if TYPE_CHECKING:
    from ..adapters.base import Adapter


class SimpleDatasetStream:
    """A simple dataset stream implementation using a list of items."""

    def __init__(self, items: list[dict[str, Any]]) -> None:
        """Initialize with a list of items."""
        self._items = items
        self._index = 0

    def get_reader(self) -> "SimpleDatasetReader":
        """Get a reader for this stream."""
        return SimpleDatasetReader(self._items)


class SimpleDatasetReader:
    """A simple dataset reader implementation."""

    def __init__(self, items: list[dict[str, Any]]) -> None:
        """Initialize with a list of items."""
        self._items = items
        self._index = 0

    async def read(self) -> dict[str, Any]:
        """Read the next item."""
        if self._index >= len(self._items):
            return {"done": True}
        item = self._items[self._index]
        self._index += 1
        return {"done": False, "value": item}


class BasePrompt[C](ABC):
    """Abstract base class for all prompt types."""

    def __init__(
        self,
        template: Any,
        engine: TemplateEngine,
        adapter: "Adapter",
        path: str | None = None,
        test_settings: TestSettings | None = None,
        loader: Loader | None = None,
    ) -> None:
        """Initialize a base prompt.

        Args:
            template: The pre-parsed MDX AST
            engine: Template engine for compilation
            adapter: Adapter for formatting output
            path: Optional path the prompt was loaded from
            test_settings: Optional test settings from frontmatter
            loader: Optional loader for loading related resources
        """
        self.template = template
        self.template_engine = engine
        self._adapter = adapter
        self._path = path
        self._test_settings = test_settings
        self._loader = loader

    async def _compile(self, props: dict[str, Any] | None) -> Any:
        """Compile the template with props.

        Args:
            props: Props to pass to the template

        Returns:
            Compiled configuration
        """
        result = await self.template_engine.compile(
            template=self.template,
            props=props,
        )
        return result

    def _metadata(self, props: dict[str, Any] | None) -> PromptMetadata:
        """Create prompt metadata.

        Args:
            props: Props used for formatting

        Returns:
            PromptMetadata dict
        """
        return {
            "props": props or {},
            "path": self._path,
            "template": self.template,
        }

    @abstractmethod
    async def format(
        self,
        props: dict[str, Any] | None = None,
        **options: Any,
    ) -> Any:
        """Format the prompt with the given props.

        Args:
            props: Props to pass to the template
            **options: Additional adapter options

        Returns:
            Formatted prompt output
        """
        pass

    async def format_with_test_props(self, **options: Any) -> Any:
        """Format using test_settings.props.

        Args:
            **options: Additional adapter options

        Returns:
            Formatted prompt output
        """
        test_props: dict[str, Any] | None = None
        if self._test_settings:
            test_props = self._test_settings.get("props")
        return await self.format(props=test_props or {}, **options)

    async def format_with_dataset(
        self,
        dataset_path: str | None = None,
        **options: Any,
    ) -> DatasetStream:
        """Format the prompt for each row in a dataset.

        Args:
            dataset_path: Path to the dataset file (JSONL format).
                If not provided, uses test_settings.dataset.
            **options: Additional adapter options passed to format().

        Returns:
            A DatasetStream that yields formatted chunks for each dataset row.

        Raises:
            ValueError: If no loader is configured or no dataset path is available.

        Example:
            prompt = await client.load_text_prompt(ast)
            dataset = await prompt.format_with_dataset()

            reader = dataset.get_reader()
            while True:
                result = await reader.read()
                if result["done"]:
                    break
                item = result["value"]
                print(item["dataset"]["input"])
                print(item["formatted"])
        """
        # Resolve dataset path
        ds_path = dataset_path or (
            self._test_settings.get("dataset") if self._test_settings else None
        )

        if not self._loader:
            raise ValueError(
                "No loader configured for this prompt. "
                "Provide a loader to use format_with_dataset."
            )

        if not ds_path:
            raise ValueError(
                "No dataset path provided. Either pass dataset_path or "
                "set test_settings.dataset in the prompt frontmatter."
            )

        # Load the dataset
        dataset_stream = await self._loader.load_dataset(ds_path)

        # Get evals from test settings
        evals = self._test_settings.get("evals", []) if self._test_settings else []

        # Process each item and yield formatted results
        results: list[dict[str, Any]] = []
        reader = dataset_stream.get_reader()

        while True:
            read_result = await reader.read()
            if read_result.get("done"):
                break

            item = read_result.get("value", {})
            input_data = item.get("input", {})
            expected_output = item.get("expected_output")

            try:
                formatted = await self.format(props=input_data, **options)
                results.append(
                    {
                        "type": "dataset",
                        "dataset": {
                            "input": input_data,
                            "expected_output": expected_output,
                        },
                        "evals": evals,
                        "formatted": formatted,
                    }
                )
            except Exception as e:
                results.append(
                    {
                        "type": "error",
                        "error": str(e),
                    }
                )

        return SimpleDatasetStream(results)

    def _build_adapt_options(self, options: dict[str, Any]) -> AdaptOptions:
        """Build AdaptOptions from kwargs.

        Args:
            options: Keyword arguments

        Returns:
            AdaptOptions dict
        """
        result: AdaptOptions = {}
        if "telemetry" in options:
            result["telemetry"] = options["telemetry"]
        if "apiKey" in options:
            result["apiKey"] = options["apiKey"]
        if "baseURL" in options:
            result["baseURL"] = options["baseURL"]
        if "toolContext" in options:
            result["toolContext"] = options["toolContext"]
        return result
