"""AgentMark main class."""

from typing import Any, cast

from .adapters.base import Adapter
from .eval_registry import EvalRegistry
from .prompts import ImagePrompt, ObjectPrompt, SpeechPrompt, TextPrompt
from .schemas import (
    ImageConfigSchema,
    ObjectConfigSchema,
    SpeechConfigSchema,
    TextConfigSchema,
)
from .template_engines import TemplateDXTemplateEngine
from .types import Loader, PromptKind, TemplateEngine, TestSettings


class AgentMark:
    """Main entry point for AgentMark prompt loading and compilation."""

    def __init__(
        self,
        adapter: Adapter,
        loader: Loader | None = None,
        template_engine: TemplateEngine | None = None,
        eval_registry: EvalRegistry | None = None,
    ) -> None:
        """Initialize AgentMark.

        Args:
            adapter: Adapter for formatting prompt output
            loader: Optional loader for loading prompts from paths
            template_engine: Optional custom template engine
            eval_registry: Optional eval registry for evaluation functions
        """
        self._adapter = adapter
        self._loader = loader
        self._template_engine: TemplateEngine = template_engine or TemplateDXTemplateEngine()
        self._eval_registry = eval_registry

    @property
    def loader(self) -> Loader | None:
        """Get the loader."""
        return self._loader

    @property
    def adapter(self) -> Adapter:
        """Get the adapter."""
        return self._adapter

    @property
    def eval_registry(self) -> EvalRegistry | None:
        """Get the eval registry."""
        return self._eval_registry

    async def load_text_prompt(
        self,
        path_or_preloaded: str | dict[str, Any],
        options: dict[str, Any] | None = None,
    ) -> TextPrompt:
        """Load a text prompt from path or preloaded AST.

        Args:
            path_or_preloaded: Either a path string or pre-parsed AST dict
            options: Optional loader options

        Returns:
            TextPrompt instance
        """
        content = await self._load_content(path_or_preloaded, "text", options)
        path = path_or_preloaded if isinstance(path_or_preloaded, str) else None

        # Compile to get test_settings
        config = await self._template_engine.compile(template=content)
        if not isinstance(config, TextConfigSchema):
            raise ValueError("Expected TextConfigSchema from compilation")

        test_settings: TestSettings | None = None
        if config.test_settings:
            test_settings = cast(TestSettings, config.test_settings.model_dump())

        return TextPrompt(
            template=content,
            engine=self._template_engine,
            adapter=self._adapter,
            path=path,
            test_settings=test_settings,
            loader=self._loader,
        )

    async def load_object_prompt(
        self,
        path_or_preloaded: str | dict[str, Any],
        options: dict[str, Any] | None = None,
    ) -> ObjectPrompt:
        """Load an object prompt from path or preloaded AST.

        Args:
            path_or_preloaded: Either a path string or pre-parsed AST dict
            options: Optional loader options

        Returns:
            ObjectPrompt instance
        """
        content = await self._load_content(path_or_preloaded, "object", options)
        path = path_or_preloaded if isinstance(path_or_preloaded, str) else None

        config = await self._template_engine.compile(template=content)
        if not isinstance(config, ObjectConfigSchema):
            raise ValueError("Expected ObjectConfigSchema from compilation")

        test_settings: TestSettings | None = None
        if config.test_settings:
            test_settings = cast(TestSettings, config.test_settings.model_dump())

        return ObjectPrompt(
            template=content,
            engine=self._template_engine,
            adapter=self._adapter,
            path=path,
            test_settings=test_settings,
            loader=self._loader,
        )

    async def load_image_prompt(
        self,
        path_or_preloaded: str | dict[str, Any],
        options: dict[str, Any] | None = None,
    ) -> ImagePrompt:
        """Load an image prompt from path or preloaded AST.

        Args:
            path_or_preloaded: Either a path string or pre-parsed AST dict
            options: Optional loader options

        Returns:
            ImagePrompt instance
        """
        content = await self._load_content(path_or_preloaded, "image", options)
        path = path_or_preloaded if isinstance(path_or_preloaded, str) else None

        config = await self._template_engine.compile(template=content)
        if not isinstance(config, ImageConfigSchema):
            raise ValueError("Expected ImageConfigSchema from compilation")

        test_settings: TestSettings | None = None
        if config.test_settings:
            test_settings = cast(TestSettings, config.test_settings.model_dump())

        return ImagePrompt(
            template=content,
            engine=self._template_engine,
            adapter=self._adapter,
            path=path,
            test_settings=test_settings,
            loader=self._loader,
        )

    async def load_speech_prompt(
        self,
        path_or_preloaded: str | dict[str, Any],
        options: dict[str, Any] | None = None,
    ) -> SpeechPrompt:
        """Load a speech prompt from path or preloaded AST.

        Args:
            path_or_preloaded: Either a path string or pre-parsed AST dict
            options: Optional loader options

        Returns:
            SpeechPrompt instance
        """
        content = await self._load_content(path_or_preloaded, "speech", options)
        path = path_or_preloaded if isinstance(path_or_preloaded, str) else None

        config = await self._template_engine.compile(template=content)
        if not isinstance(config, SpeechConfigSchema):
            raise ValueError("Expected SpeechConfigSchema from compilation")

        test_settings: TestSettings | None = None
        if config.test_settings:
            test_settings = cast(TestSettings, config.test_settings.model_dump())

        return SpeechPrompt(
            template=content,
            engine=self._template_engine,
            adapter=self._adapter,
            path=path,
            test_settings=test_settings,
            loader=self._loader,
        )

    async def _load_content(
        self,
        path_or_preloaded: str | dict[str, Any],
        prompt_type: PromptKind,
        options: dict[str, Any] | None,
    ) -> Any:
        """Load content from path or return preloaded AST.

        Args:
            path_or_preloaded: Either a path string or pre-parsed AST dict
            prompt_type: Type of prompt being loaded
            options: Optional loader options

        Returns:
            The loaded or preloaded content
        """
        if isinstance(path_or_preloaded, str) and self._loader:
            return await self._loader.load(path_or_preloaded, prompt_type, options)
        return path_or_preloaded


def create_agentmark(
    adapter: Adapter,
    loader: Loader | None = None,
    template_engine: TemplateEngine | None = None,
    eval_registry: EvalRegistry | None = None,
) -> AgentMark:
    """Factory function to create an AgentMark instance.

    Args:
        adapter: Adapter for formatting prompt output
        loader: Optional loader for loading prompts from paths
        template_engine: Optional custom template engine
        eval_registry: Optional eval registry for evaluation functions

    Returns:
        Configured AgentMark instance
    """
    return AgentMark(
        adapter=adapter,
        loader=loader,
        template_engine=template_engine,
        eval_registry=eval_registry,
    )
