import { SpanAttributeKeys } from "../const";

export const transformAttributes = (attributes: Record<string, any>) => {
  try {
    const transformed: Record<string, any> = {};

    // Operation Info
    if (attributes[SpanAttributeKeys.AI_OPERATION_ID]) {
      transformed.operation = {
        id: attributes[SpanAttributeKeys.AI_OPERATION_ID],
        name: attributes[SpanAttributeKeys.AI_OPERATION_NAME],
      };
    }

    // Model Info (if exists)
    if (
      attributes[SpanAttributeKeys.REQUEST_MODEL] ||
      attributes[SpanAttributeKeys.AI_MODEL_ID]
    ) {
      transformed.model = {
        id:
          attributes[SpanAttributeKeys.REQUEST_MODEL] ||
          attributes[SpanAttributeKeys.AI_MODEL_ID],
        provider: attributes[SpanAttributeKeys.AI_MODEL_PROVIDER],
      };
    }

    // Settings (if exists)
    const settings: Record<string, any> = {};
    if (
      attributes[SpanAttributeKeys.GEN_AI_REQUEST_MAX_TOKENS] ||
      attributes[SpanAttributeKeys.AI_SETTINGS_MAX_TOKENS]
    ) {
      settings.maxTokens =
        attributes[SpanAttributeKeys.GEN_AI_REQUEST_MAX_TOKENS] ||
        attributes[SpanAttributeKeys.AI_SETTINGS_MAX_TOKENS];
    }
    if (
      attributes[SpanAttributeKeys.GEN_AI_REQUEST_TEMPERATURE] ||
      attributes[SpanAttributeKeys.AI_SETTINGS_TEMPERATURE]
    ) {
      settings.temperature =
        attributes[SpanAttributeKeys.GEN_AI_REQUEST_TEMPERATURE] ||
        attributes[SpanAttributeKeys.AI_SETTINGS_TEMPERATURE];
    }
    if (
      attributes[SpanAttributeKeys.GEN_AI_REQUEST_TOP_P] ||
      attributes[SpanAttributeKeys.AI_SETTINGS_TOP_P]
    ) {
      settings.topP =
        attributes[SpanAttributeKeys.GEN_AI_REQUEST_TOP_P] ||
        attributes[SpanAttributeKeys.AI_SETTINGS_TOP_P];
    }
    if (
      attributes[SpanAttributeKeys.GEN_AI_REQUEST_PRESENCE_PENALTY] ||
      attributes[SpanAttributeKeys.AI_SETTINGS_PRESENCE_PENALTY]
    ) {
      settings.presencePenalty =
        attributes[SpanAttributeKeys.GEN_AI_REQUEST_PRESENCE_PENALTY] ||
        attributes[SpanAttributeKeys.AI_SETTINGS_PRESENCE_PENALTY];
    }
    if (Object.keys(settings).length > 0) {
      transformed.settings = settings;
    }

    // Tool Call Info
    if (attributes[SpanAttributeKeys.AI_TOOL_CALL_NAME]) {
      transformed.tool = {
        name: attributes[SpanAttributeKeys.AI_TOOL_CALL_NAME],
        id: attributes[SpanAttributeKeys.AI_TOOL_CALL_ID],
        args: attributes[SpanAttributeKeys.AI_TOOL_CALL_ARGS]
          ? JSON.parse(attributes[SpanAttributeKeys.AI_TOOL_CALL_ARGS])
          : undefined,
        result: attributes[SpanAttributeKeys.AI_TOOL_CALL_RESULT],
      };
    }

    // Metadata
    const metadata: Record<string, any> = {};
    Object.entries(attributes).forEach(([key, value]) => {
      if (key.startsWith(SpanAttributeKeys.AI_TELEMETRY_METADATA_PREFIX)) {
        const metadataKey = key.replace(
          SpanAttributeKeys.AI_TELEMETRY_METADATA_PREFIX,
          ""
        );
        if (metadataKey === "props") {
          return;
        }
        try {
          metadata[metadataKey] = JSON.parse(value);
        } catch {
          metadata[metadataKey] = value;
        }
      }
    });
    if (Object.keys(metadata).length > 0) {
      transformed.metadata = metadata;
    }

    // Props (if exists)
    if (attributes[SpanAttributeKeys.AI_TELEMETRY_METADATA_PROPS]) {
      transformed.props = JSON.parse(
        attributes[SpanAttributeKeys.AI_TELEMETRY_METADATA_PROPS]
      );
    }

    // Response (if exists)
    const response: Record<string, any> = {};
    if (
      attributes[SpanAttributeKeys.AI_RESPONSE_FINISH_REASON] ||
      attributes[SpanAttributeKeys.GEN_AI_RESPONSE_FINISH_REASONS]
    ) {
      response.finishReason =
        attributes[SpanAttributeKeys.AI_RESPONSE_FINISH_REASON] ||
        attributes[SpanAttributeKeys.GEN_AI_RESPONSE_FINISH_REASONS];
    }
    if (attributes[SpanAttributeKeys.AI_RESPONSE_TEXT]) {
      response.text = attributes[SpanAttributeKeys.AI_RESPONSE_TEXT];
    }
    if (attributes[SpanAttributeKeys.AI_RESPONSE_OBJECT]) {
      response.schema = JSON.parse(
        attributes[SpanAttributeKeys.AI_RESPONSE_OBJECT]
      );
    }
    if (Object.keys(response).length > 0) {
      transformed.response = response;
    }

    // Usage (if exists)
    const usage: Record<string, any> = {};
    if (
      attributes[SpanAttributeKeys.GEN_AI_USAGE_INPUT_TOKENS] ||
      attributes[SpanAttributeKeys.AI_USAGE_PROMPT_TOKENS]
    ) {
      usage.inputTokens =
        attributes[SpanAttributeKeys.GEN_AI_USAGE_INPUT_TOKENS] ||
        attributes[SpanAttributeKeys.AI_USAGE_PROMPT_TOKENS];
    }
    if (
      attributes[SpanAttributeKeys.GEN_AI_USAGE_OUTPUT_TOKENS] ||
      attributes[SpanAttributeKeys.AI_USAGE_COMPLETION_TOKENS]
    ) {
      usage.outputTokens =
        attributes[SpanAttributeKeys.GEN_AI_USAGE_OUTPUT_TOKENS] ||
        attributes[SpanAttributeKeys.AI_USAGE_COMPLETION_TOKENS];
    }
    if (attributes[SpanAttributeKeys.GEN_AI_USAGE_COST]) {
      usage.cost = attributes[SpanAttributeKeys.GEN_AI_USAGE_COST];
    }
    if (Object.keys(usage).length > 0) {
      transformed.usage = usage;
    }

    return transformed;
  } catch (_error) {
    return attributes;
  }
};
