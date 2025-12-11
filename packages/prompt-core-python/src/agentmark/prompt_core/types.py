"""Type definitions for prompt-core."""

from collections.abc import Awaitable, Callable
from typing import Any, Literal, Protocol, TypedDict

# JSON types
JSONPrimitive = str | int | float | bool | None
JSONValue = JSONPrimitive | dict[str, "JSONValue"] | list["JSONValue"]
JSONObject = dict[str, JSONValue]

# Prompt kinds
PromptKind = Literal["text", "object", "image", "speech"]


# Message content types
class TextPart(TypedDict):
    """Text content part."""

    type: Literal["text"]
    text: str


class ImagePart(TypedDict, total=False):
    """Image content part."""

    type: Literal["image"]
    image: str
    mimeType: str | None


class FilePart(TypedDict):
    """File content part."""

    type: Literal["file"]
    data: str
    mimeType: str


ContentPart = TextPart | ImagePart | FilePart


class ChatMessage(TypedDict):
    """Simple chat message."""

    role: Literal["system", "user", "assistant"]
    content: str


class RichChatMessage(TypedDict):
    """Rich chat message with potential multipart content."""

    role: Literal["system", "user", "assistant"]
    content: str | list[ContentPart]


# Adapter options
class TelemetryOptions(TypedDict, total=False):
    """Telemetry configuration options."""

    isEnabled: bool
    functionId: str
    metadata: dict[str, Any]


class AdaptOptions(TypedDict, total=False):
    """Options passed to adapter methods."""

    telemetry: TelemetryOptions
    apiKey: str
    baseURL: str
    toolContext: dict[str, Any]


# Prompt metadata
class PromptMetadata(TypedDict):
    """Metadata about a prompt."""

    props: JSONObject
    path: str | None
    template: Any


# Eval types
class EvalParams(TypedDict, total=False):
    """Parameters for evaluation functions."""

    input: str | dict[str, Any] | list[dict[str, Any] | str]
    output: str | dict[str, Any] | list[dict[str, Any] | str]
    expectedOutput: str | None


class EvalResult(TypedDict, total=False):
    """Result from an evaluation function."""

    score: float  # 0-1 scale
    label: str  # e.g., "correct", "incorrect"
    reason: str  # explanation
    passed: bool  # pass/fail


EvalFunction = Callable[[EvalParams], EvalResult | Awaitable[EvalResult]]


# Test settings
class TestSettings(TypedDict, total=False):
    """Test settings from frontmatter."""

    props: dict[str, Any] | None
    dataset: str | None
    evals: list[str] | None


# Dataset types
class DatasetItem(TypedDict):
    """A single item from a dataset."""

    input: dict[str, Any]
    expected_output: str | None


class DatasetStreamChunk(TypedDict):
    """A chunk from the dataset stream with formatted output."""

    type: Literal["dataset"]
    dataset: DatasetItem
    evals: list[str]
    formatted: Any


class DatasetErrorChunk(TypedDict):
    """An error chunk from the dataset stream."""

    type: Literal["error"]
    error: str


class FormatWithDatasetOptions(TypedDict, total=False):
    """Options for format_with_dataset."""

    dataset_path: str
    telemetry: TelemetryOptions
    api_key: str
    base_url: str
    tool_context: dict[str, Any]


# Async iterator for dataset streaming
class DatasetReader(Protocol):
    """Protocol for dataset reader with async iteration."""

    async def read(self) -> dict[str, Any]:
        """Read the next item. Returns {'done': True} when complete."""
        ...


class DatasetStream(Protocol):
    """Protocol for dataset streams."""

    def get_reader(self) -> DatasetReader:
        """Get a reader for the stream."""
        ...


# Loader protocol
class Loader(Protocol):
    """Protocol for prompt loaders."""

    async def load(
        self, path: str, prompt_type: PromptKind, options: dict[str, Any] | None = None
    ) -> Any:
        """Load a prompt from a path."""
        ...

    async def load_dataset(self, dataset_path: str) -> DatasetStream:
        """Load a dataset from a path.

        Args:
            dataset_path: Path to the dataset file (JSONL format).

        Returns:
            A DatasetStream that can be iterated to get dataset items.
        """
        ...


# Template engine protocol
class TemplateEngine(Protocol):
    """Protocol for template engines."""

    async def compile(
        self,
        template: Any,
        props: dict[str, Any] | None = None,
    ) -> Any:
        """Compile a template with props."""
        ...
