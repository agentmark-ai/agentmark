"""Tests for Pydantic schemas."""

import pytest
from pydantic import ValidationError

from agentmark.prompt_core.schemas import (
    ImageConfigSchema,
    ImageSettingsSchema,
    ObjectConfigSchema,
    ObjectSettingsSchema,
    SpeechConfigSchema,
    SpeechSettingsSchema,
    TextConfigSchema,
    TextSettingsSchema,
)


class TestTextSettingsSchema:
    """Tests for TextSettingsSchema."""

    def test_valid_minimal(self) -> None:
        """Test minimal valid text settings."""
        settings = TextSettingsSchema(model_name="gpt-4")
        assert settings.model_name == "gpt-4"
        assert settings.temperature is None

    def test_valid_full(self) -> None:
        """Test full text settings."""
        settings = TextSettingsSchema(
            model_name="gpt-4",
            temperature=0.7,
            max_tokens=1000,
            top_p=0.9,
        )
        assert settings.model_name == "gpt-4"
        assert settings.temperature == 0.7
        assert settings.max_tokens == 1000

    def test_invalid_missing_model(self) -> None:
        """Test that model_name is required."""
        with pytest.raises(ValidationError):
            TextSettingsSchema()  # type: ignore[call-arg]


class TestTextConfigSchema:
    """Tests for TextConfigSchema."""

    def test_valid_config(self) -> None:
        """Test valid text config."""
        config = TextConfigSchema(
            name="test",
            messages=[{"role": "user", "content": "Hello"}],
            text_config=TextSettingsSchema(model_name="gpt-4"),
        )
        assert config.name == "test"
        assert len(config.messages) == 1

    def test_with_test_settings(self) -> None:
        """Test text config with test settings."""
        config = TextConfigSchema(
            name="test",
            messages=[{"role": "user", "content": "Hello"}],
            text_config=TextSettingsSchema(model_name="gpt-4"),
            test_settings={"props": {"foo": "bar"}},
        )
        assert config.test_settings is not None
        assert config.test_settings.props == {"foo": "bar"}


class TestObjectConfigSchema:
    """Tests for ObjectConfigSchema."""

    def test_valid_config(self) -> None:
        """Test valid object config."""
        config = ObjectConfigSchema(
            name="test",
            messages=[{"role": "user", "content": "Hello"}],
            object_config={
                "model_name": "gpt-4",
                "schema": {"type": "object", "properties": {}},
            },
        )
        assert config.name == "test"
        assert config.object_config.schema_ == {"type": "object", "properties": {}}


class TestImageConfigSchema:
    """Tests for ImageConfigSchema."""

    def test_valid_config(self) -> None:
        """Test valid image config."""
        config = ImageConfigSchema(
            name="test",
            image_config={
                "model_name": "dall-e-3",
                "prompt": "A cat",
                "size": "1024x1024",
            },
        )
        assert config.name == "test"
        assert config.image_config.prompt == "A cat"
        assert config.image_config.size == "1024x1024"


class TestSpeechConfigSchema:
    """Tests for SpeechConfigSchema."""

    def test_valid_config(self) -> None:
        """Test valid speech config."""
        config = SpeechConfigSchema(
            name="test",
            speech_config={
                "model_name": "tts-1",
                "text": "Hello world",
                "voice": "nova",
            },
        )
        assert config.name == "test"
        assert config.speech_config.text == "Hello world"
        assert config.speech_config.voice == "nova"


class TestSettingsSchemaValidation:
    """Parameterized tests for settings schema validation."""

    @pytest.mark.parametrize(
        "schema_class,valid_data",
        [
            (TextSettingsSchema, {"model_name": "gpt-4"}),
            (TextSettingsSchema, {"model_name": "gpt-4", "temperature": 0.5}),
            (TextSettingsSchema, {"model_name": "gpt-4", "max_tokens": 100}),
            (ObjectSettingsSchema, {"model_name": "gpt-4", "schema": {"type": "object"}}),
            (ObjectSettingsSchema, {"model_name": "gpt-4", "schema": {}, "temperature": 0.7}),
            (ImageSettingsSchema, {"model_name": "dall-e-3", "prompt": "A sunset"}),
            (ImageSettingsSchema, {"model_name": "dall-e-3", "prompt": "A cat", "size": "512x512"}),
            (SpeechSettingsSchema, {"model_name": "tts-1", "text": "Hello", "voice": "alloy"}),
            (SpeechSettingsSchema, {"model_name": "tts-1", "text": "Hi", "voice": "nova", "speed": 1.5}),
        ],
        ids=[
            "text-minimal",
            "text-with-temperature",
            "text-with-max-tokens",
            "object-minimal",
            "object-with-temperature",
            "image-minimal",
            "image-with-size",
            "speech-minimal",
            "speech-with-speed",
        ],
    )
    def test_valid_settings(self, schema_class: type, valid_data: dict) -> None:
        """Test that valid data passes validation."""
        instance = schema_class(**valid_data)
        assert instance.model_name == valid_data["model_name"]

    @pytest.mark.parametrize(
        "schema_class,invalid_data,error_field",
        [
            (TextSettingsSchema, {}, "model_name"),
            (ObjectSettingsSchema, {"model_name": "gpt-4"}, "schema"),
            (ImageSettingsSchema, {}, "model_name"),
            (SpeechSettingsSchema, {}, "model_name"),
        ],
        ids=[
            "text-missing-model",
            "object-missing-schema",
            "image-missing-model",
            "speech-missing-model",
        ],
    )
    def test_invalid_settings_missing_required(
        self, schema_class: type, invalid_data: dict, error_field: str
    ) -> None:
        """Test that missing required fields raise ValidationError."""
        with pytest.raises(ValidationError) as exc_info:
            schema_class(**invalid_data)
        errors = exc_info.value.errors()
        assert any(error_field in str(e["loc"]) for e in errors)


class TestConfigSchemaValidation:
    """Parameterized tests for config schema validation."""

    @pytest.mark.parametrize(
        "schema_class,config_key,settings_data,requires_messages",
        [
            (TextConfigSchema, "text_config", {"model_name": "gpt-4"}, True),
            (ObjectConfigSchema, "object_config", {"model_name": "gpt-4", "schema": {}}, True),
            (ImageConfigSchema, "image_config", {"model_name": "dall-e-3", "prompt": "test"}, False),
            (SpeechConfigSchema, "speech_config", {"model_name": "tts-1", "text": "hi", "voice": "nova"}, False),
        ],
        ids=["text", "object", "image", "speech"],
    )
    def test_config_with_name(
        self, schema_class: type, config_key: str, settings_data: dict, requires_messages: bool
    ) -> None:
        """Test config schemas accept name and settings."""
        kwargs: dict = {"name": "test-prompt", config_key: settings_data}
        if requires_messages:
            kwargs["messages"] = [{"role": "user", "content": "Hello"}]
        config = schema_class(**kwargs)
        assert config.name == "test-prompt"

    @pytest.mark.parametrize(
        "schema_class,config_key,settings_data",
        [
            (TextConfigSchema, "text_config", {"model_name": "gpt-4"}),
            (ObjectConfigSchema, "object_config", {"model_name": "gpt-4", "schema": {}}),
        ],
        ids=["text", "object"],
    )
    def test_config_with_messages(
        self, schema_class: type, config_key: str, settings_data: dict
    ) -> None:
        """Test config schemas accept messages."""
        messages = [
            {"role": "system", "content": "You are helpful"},
            {"role": "user", "content": "Hello"},
        ]
        config = schema_class(name="test", messages=messages, **{config_key: settings_data})
        assert len(config.messages) == 2
        assert config.messages[0].role == "system"

    @pytest.mark.parametrize(
        "schema_class,config_key,settings_data",
        [
            (TextConfigSchema, "text_config", {"model_name": "gpt-4"}),
            (ObjectConfigSchema, "object_config", {"model_name": "gpt-4", "schema": {}}),
        ],
        ids=["text-missing-messages", "object-missing-messages"],
    )
    def test_config_requires_messages(
        self, schema_class: type, config_key: str, settings_data: dict
    ) -> None:
        """Test that text/object configs require messages."""
        with pytest.raises(ValidationError) as exc_info:
            schema_class(name="test", **{config_key: settings_data})
        errors = exc_info.value.errors()
        assert any("messages" in str(e["loc"]) for e in errors)
