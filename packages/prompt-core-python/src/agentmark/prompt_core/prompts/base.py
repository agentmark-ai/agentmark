"""Base prompt class."""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

from ..types import AdaptOptions, Loader, PromptMetadata, TemplateEngine, TestSettings

if TYPE_CHECKING:
    from ..adapters.base import Adapter


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
