"""AgentMark Prompt Core - Python implementation."""

from .adapters import Adapter, DefaultAdapter
from .agentmark import AgentMark, create_agentmark
from .eval_registry import EvalRegistry
from .loaders import FileDatasetReader, FileDatasetStream, FileLoader
from .mcp import (
    InlineToolDefinition,
    McpServerConfig,
    McpServers,
    McpStdioServerConfig,
    McpUrlServerConfig,
    NormalizedTool,
    interpolate_env_in_object,
    normalize_tools_map,
    parse_mcp_uri,
)
from .prompts import (
    BasePrompt,
    ImagePrompt,
    ObjectPrompt,
    SimpleDatasetReader,
    SimpleDatasetStream,
    SpeechPrompt,
    TextPrompt,
)
from .schemas import (
    AgentmarkConfigSchema,
    ImageConfigSchema,
    ImageSettingsSchema,
    ObjectConfigSchema,
    ObjectSettingsSchema,
    SpeechConfigSchema,
    SpeechSettingsSchema,
    TestSettingsSchema,
    TextConfigSchema,
    TextSettingsSchema,
)
from .template_engines import TemplateDXTemplateEngine, get_front_matter
from .types import (
    AdaptOptions,
    ChatMessage,
    ContentPart,
    DatasetErrorChunk,
    DatasetItem,
    DatasetReader,
    DatasetStream,
    DatasetStreamChunk,
    EvalFunction,
    EvalParams,
    EvalResult,
    FilePart,
    FormatWithDatasetOptions,
    ImagePart,
    JSONObject,
    JSONPrimitive,
    JSONValue,
    Loader,
    PromptKind,
    PromptMetadata,
    RichChatMessage,
    TelemetryOptions,
    TemplateEngine,
    TestSettings,
    TextPart,
)

__all__ = [
    # Main classes
    "AgentMark",
    "create_agentmark",
    # Adapters
    "Adapter",
    "DefaultAdapter",
    # Prompts
    "BasePrompt",
    "TextPrompt",
    "ObjectPrompt",
    "ImagePrompt",
    "SpeechPrompt",
    "SimpleDatasetStream",
    "SimpleDatasetReader",
    # Registries
    "EvalRegistry",
    # Loaders
    "FileLoader",
    "FileDatasetStream",
    "FileDatasetReader",
    # Template engines
    "TemplateDXTemplateEngine",
    "get_front_matter",
    # Schemas
    "TextConfigSchema",
    "ObjectConfigSchema",
    "ImageConfigSchema",
    "SpeechConfigSchema",
    "AgentmarkConfigSchema",
    "TextSettingsSchema",
    "ObjectSettingsSchema",
    "ImageSettingsSchema",
    "SpeechSettingsSchema",
    "TestSettingsSchema",
    # Types
    "JSONPrimitive",
    "JSONValue",
    "JSONObject",
    "PromptKind",
    "TextPart",
    "ImagePart",
    "FilePart",
    "ContentPart",
    "ChatMessage",
    "RichChatMessage",
    "TelemetryOptions",
    "AdaptOptions",
    "PromptMetadata",
    "EvalParams",
    "EvalResult",
    "EvalFunction",
    "TestSettings",
    "Loader",
    "TemplateEngine",
    # Dataset types
    "DatasetItem",
    "DatasetStreamChunk",
    "DatasetErrorChunk",
    "FormatWithDatasetOptions",
    "DatasetReader",
    "DatasetStream",
    # MCP utilities
    "parse_mcp_uri",
    "interpolate_env_in_object",
    "normalize_tools_map",
    "McpUrlServerConfig",
    "McpStdioServerConfig",
    "McpServerConfig",
    "McpServers",
    "InlineToolDefinition",
    "NormalizedTool",
]

__version__ = "0.1.0"
