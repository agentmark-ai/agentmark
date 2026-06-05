"""AgentMark Prompt Core - Python implementation."""

from importlib.metadata import version as _pkg_version

from .adapters import Adapter, DefaultAdapter
from .agentmark import AgentMark, create_agentmark
from .api_loader import ApiDatasetReader, ApiDatasetStream, ApiLoader
from .base_adapter import (
    BaseAdapter,
    ParamMap,
    ParamMapEntry,
    ParamMapTransform,
    apply_param_map,
    build_telemetry_metadata,
)
from .eval_registry import EvalRegistry
from .executor import (
    AgentEvent,
    ErrorEvent,
    ExecCtx,
    Executor,
    ExecutorCapabilities,
    FinishEvent,
    ObjectDeltaEvent,
    ObjectFinalEvent,
    ObjectStreamEvent,
    ReasoningDeltaEvent,
    TextDeltaEvent,
    TextStreamEvent,
    ToolCallEvent,
    ToolResultEvent,
    UsageData,
)
from .executor_builder import (
    ExecutorObjectResult,
    ExecutorTextResult,
    create_executor,
)
from .executor_conformance import (
    ConformanceError,
    ConformanceViolation,
    assert_error_stream,
    assert_object_stream,
    assert_text_stream,
    assert_usage_shape,
    run_executor_conformance,
)
from .executor_helpers import finalize_usage, normalize_error
from .experiment import (
    DEFAULT_EXPERIMENT_CONCURRENCY,
    run_dataset_pool,
)
from .loaders import FileDatasetReader, FileDatasetStream, FileLoader
from .mcp import (
    McpServerConfig,
    McpServers,
    McpStdioServerConfig,
    McpUrlServerConfig,
    NormalizedTool,
    interpolate_env_in_object,
    normalize_tools_list,
    parse_mcp_uri,
)
from .mcp_registry import McpClient, McpClientFactory, McpServerRegistry
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
from .webhook_runner import (
    ExperimentItemParams,
    ExperimentItemSpan,
    ExperimentItemSpanHook,
    PromptSpan,
    PromptSpanHook,
    PromptSpanParams,
    WebhookRunner,
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
    # Experiment runner concurrency
    "run_dataset_pool",
    "DEFAULT_EXPERIMENT_CONCURRENCY",
    # Loaders
    "ApiLoader",
    "ApiDatasetStream",
    "ApiDatasetReader",
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
    "normalize_tools_list",
    "McpUrlServerConfig",
    "McpStdioServerConfig",
    "McpServerConfig",
    "McpServers",
    "NormalizedTool",
    # Executor protocol — public BYO-SDK contract
    "AgentEvent",
    "TextStreamEvent",
    "ObjectStreamEvent",
    "Executor",
    "ExecutorCapabilities",
    "ExecCtx",
    "TextDeltaEvent",
    "ReasoningDeltaEvent",
    "ObjectDeltaEvent",
    "ObjectFinalEvent",
    "ToolCallEvent",
    "ToolResultEvent",
    "UsageData",
    "FinishEvent",
    "ErrorEvent",
    # Shared MCP registry (generic over tool type)
    "McpServerRegistry",
    "McpClient",
    "McpClientFactory",
    # Base adapter primitives
    "BaseAdapter",
    "apply_param_map",
    "build_telemetry_metadata",
    "ParamMap",
    "ParamMapEntry",
    "ParamMapTransform",
    # Shared webhook runner
    "WebhookRunner",
    "PromptSpanParams",
    "PromptSpan",
    "PromptSpanHook",
    "ExperimentItemParams",
    "ExperimentItemSpan",
    "ExperimentItemSpanHook",
    # Conformance suite
    "assert_text_stream",
    "assert_object_stream",
    "assert_error_stream",
    "assert_usage_shape",
    "run_executor_conformance",
    "ConformanceError",
    "ConformanceViolation",
    # Cross-adapter executor primitives
    "finalize_usage",
    "normalize_error",
    # Generic Executor builder (BYO-SDK bootstrapping)
    "create_executor",
    "ExecutorTextResult",
    "ExecutorObjectResult",
]

# Read runtime __version__ from installed dist metadata to prevent drift
# against pyproject.toml across releases. See pydantic-ai-v0-adapter for
# the same pattern and rationale.
__version__ = _pkg_version("agentmark-prompt-core")
