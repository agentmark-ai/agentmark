"""Image prompt class."""

from typing import Any

from ..schemas import ImageConfigSchema
from .base import BasePrompt


class ImagePrompt(BasePrompt[ImageConfigSchema]):
    """Image generation prompt."""

    async def format(
        self,
        props: dict[str, Any] | None = None,
        **options: Any,
    ) -> Any:
        """Format the image prompt.

        Args:
            props: Props to pass to the template
            **options: Additional adapter options

        Returns:
            Adapted image prompt output
        """
        compiled = await self._compile(props)
        adapt_options = self._build_adapt_options(options)
        return self._adapter.adapt_image(compiled, adapt_options)
