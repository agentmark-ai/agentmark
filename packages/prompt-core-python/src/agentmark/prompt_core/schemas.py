"""Pydantic schemas for prompt configurations."""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class TextPartSchema(BaseModel):
    """Text content part schema."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["text"]
    text: str


class ImagePartSchema(BaseModel):
    """Image content part schema."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["image"]
    image: str
    mimeType: str | None = None


class FilePartSchema(BaseModel):
    """File content part schema."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["file"]
    data: str
    mimeType: str


ContentPartSchema = TextPartSchema | ImagePartSchema | FilePartSchema


class UserMessageSchema(BaseModel):
    """User message schema."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["user"]
    content: str | list[ContentPartSchema]


class AssistantMessageSchema(BaseModel):
    """Assistant message schema."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["assistant"]
    content: str


class SystemMessageSchema(BaseModel):
    """System message schema."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["system"]
    content: str


RichChatMessageSchema = UserMessageSchema | AssistantMessageSchema | SystemMessageSchema


class ToolChoiceSchema(BaseModel):
    """Tool choice schema."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["tool"]
    tool_name: str


class TextSettingsSchema(BaseModel):
    """Text generation settings schema."""

    model_config = ConfigDict(extra="forbid")

    model_name: str
    max_tokens: int | None = None
    temperature: float | None = None
    max_calls: int | None = None
    top_p: float | None = None
    top_k: int | None = None
    presence_penalty: float | None = None
    frequency_penalty: float | None = None
    stop_sequences: list[str] | None = None
    seed: int | None = None
    max_retries: int | None = None
    tool_choice: Literal["auto", "none", "required"] | ToolChoiceSchema | None = None
    tools: dict[str, str | dict[str, Any]] | None = None


class ObjectSettingsSchema(BaseModel):
    """Object/structured output settings schema."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    model_name: str
    max_tokens: int | None = None
    temperature: float | None = None
    max_calls: int | None = None
    top_p: float | None = None
    top_k: int | None = None
    presence_penalty: float | None = None
    frequency_penalty: float | None = None
    stop_sequences: list[str] | None = None
    seed: int | None = None
    max_retries: int | None = None
    schema_: Annotated[dict[str, Any], Field(alias="schema")]
    schema_name: str | None = None
    schema_description: str | None = None


class ImageSettingsSchema(BaseModel):
    """Image generation settings schema."""

    model_config = ConfigDict(extra="forbid")

    model_name: str
    prompt: str = ""
    num_images: int | None = None
    size: str | None = None  # e.g., "1024x1024"
    aspect_ratio: str | None = None  # e.g., "1:1"
    seed: int | None = None


class SpeechSettingsSchema(BaseModel):
    """Speech synthesis settings schema."""

    model_config = ConfigDict(extra="forbid")

    model_name: str
    text: str = ""
    voice: str | None = None
    output_format: str | None = None
    instructions: str | None = None
    speed: float | None = None


class TestSettingsSchema(BaseModel):
    """Test settings schema."""

    model_config = ConfigDict(extra="forbid")

    props: dict[str, Any] | None = None
    dataset: str | None = None
    evals: list[str] | None = None


class TextConfigSchema(BaseModel):
    """Text prompt configuration schema."""

    model_config = ConfigDict(extra="forbid")

    name: str
    messages: list[RichChatMessageSchema]
    text_config: TextSettingsSchema
    test_settings: TestSettingsSchema | None = None
    agentmark_meta: dict[str, Any] | None = None


class ObjectConfigSchema(BaseModel):
    """Object prompt configuration schema."""

    model_config = ConfigDict(extra="forbid")

    name: str
    messages: list[RichChatMessageSchema]
    object_config: ObjectSettingsSchema
    test_settings: TestSettingsSchema | None = None
    agentmark_meta: dict[str, Any] | None = None


class ImageConfigSchema(BaseModel):
    """Image prompt configuration schema."""

    model_config = ConfigDict(extra="forbid")

    name: str
    image_config: ImageSettingsSchema
    test_settings: TestSettingsSchema | None = None
    agentmark_meta: dict[str, Any] | None = None


class SpeechConfigSchema(BaseModel):
    """Speech prompt configuration schema."""

    model_config = ConfigDict(extra="forbid")

    name: str
    speech_config: SpeechSettingsSchema
    test_settings: TestSettingsSchema | None = None
    agentmark_meta: dict[str, Any] | None = None


AgentmarkConfigSchema = TextConfigSchema | ObjectConfigSchema | ImageConfigSchema | SpeechConfigSchema
