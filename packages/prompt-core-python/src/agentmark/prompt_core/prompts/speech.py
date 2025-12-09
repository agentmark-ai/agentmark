"""Speech prompt class."""

from typing import Any

from ..schemas import SpeechConfigSchema
from .base import BasePrompt


class SpeechPrompt(BasePrompt[SpeechConfigSchema]):
    """Speech synthesis prompt."""

    async def format(
        self,
        props: dict[str, Any] | None = None,
        **options: Any,
    ) -> Any:
        """Format the speech prompt.

        Args:
            props: Props to pass to the template
            **options: Additional adapter options

        Returns:
            Adapted speech prompt output
        """
        compiled = await self._compile(props)
        adapt_options = self._build_adapt_options(options)
        return self._adapter.adapt_speech(compiled, adapt_options)
