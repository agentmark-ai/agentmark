import { AttributeTransformer } from "../attribute-transformer-registry";
import { SpanAttributeKeys } from "../../const";

export class AiSdkTransformer implements AttributeTransformer {
  transform(
    attributes: Record<string, any>,
    _normalizedData?: any
  ): Record<string, any> | null {
    try {
      const transformed: Record<string, any> = {};
      let hasAnyData = false;

      if (attributes[SpanAttributeKeys.AI_OPERATION_ID]) {
        transformed.operation = {
          id: attributes[SpanAttributeKeys.AI_OPERATION_ID],
          name: attributes[SpanAttributeKeys.AI_OPERATION_NAME],
        };
        hasAnyData = true;
      }

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
        hasAnyData = true;
      }

      const settings: Record<string, any> = {};
      if (
        attributes[SpanAttributeKeys.GEN_AI_REQUEST_MAX_TOKENS] ||
        attributes[SpanAttributeKeys.AI_SETTINGS_MAX_TOKENS]
      ) {
        settings.maxTokens =
          attributes[SpanAttributeKeys.GEN_AI_REQUEST_MAX_TOKENS] ||
          attributes[SpanAttributeKeys.AI_SETTINGS_MAX_TOKENS];
        hasAnyData = true;
      }
      if (
        attributes[SpanAttributeKeys.GEN_AI_REQUEST_TEMPERATURE] ||
        attributes[SpanAttributeKeys.AI_SETTINGS_TEMPERATURE]
      ) {
        settings.temperature =
          attributes[SpanAttributeKeys.GEN_AI_REQUEST_TEMPERATURE] ||
          attributes[SpanAttributeKeys.AI_SETTINGS_TEMPERATURE];
        hasAnyData = true;
      }
      if (
        attributes[SpanAttributeKeys.GEN_AI_REQUEST_TOP_P] ||
        attributes[SpanAttributeKeys.AI_SETTINGS_TOP_P]
      ) {
        settings.topP =
          attributes[SpanAttributeKeys.GEN_AI_REQUEST_TOP_P] ||
          attributes[SpanAttributeKeys.AI_SETTINGS_TOP_P];
        hasAnyData = true;
      }
      if (
        attributes[SpanAttributeKeys.GEN_AI_REQUEST_PRESENCE_PENALTY] ||
        attributes[SpanAttributeKeys.AI_SETTINGS_PRESENCE_PENALTY]
      ) {
        settings.presencePenalty =
          attributes[SpanAttributeKeys.GEN_AI_REQUEST_PRESENCE_PENALTY] ||
          attributes[SpanAttributeKeys.AI_SETTINGS_PRESENCE_PENALTY];
        hasAnyData = true;
      }
      if (Object.keys(settings).length > 0) {
        transformed.settings = settings;
      }

      if (attributes[SpanAttributeKeys.AI_TOOL_CALL_NAME]) {
        transformed.tool = {
          name: attributes[SpanAttributeKeys.AI_TOOL_CALL_NAME],
          id: attributes[SpanAttributeKeys.AI_TOOL_CALL_ID],
          args: attributes[SpanAttributeKeys.AI_TOOL_CALL_ARGS]
            ? JSON.parse(attributes[SpanAttributeKeys.AI_TOOL_CALL_ARGS])
            : undefined,
          result: attributes[SpanAttributeKeys.AI_TOOL_CALL_RESULT],
        };
        hasAnyData = true;
      }

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
          hasAnyData = true;
        }
      });
      if (Object.keys(metadata).length > 0) {
        transformed.metadata = metadata;
      }

      if (attributes[SpanAttributeKeys.AI_TELEMETRY_METADATA_PROPS]) {
        try {
          transformed.props = JSON.parse(
            attributes[SpanAttributeKeys.AI_TELEMETRY_METADATA_PROPS]
          );
          hasAnyData = true;
        } catch {
          transformed.props = attributes[SpanAttributeKeys.AI_TELEMETRY_METADATA_PROPS];
          hasAnyData = true;
        }
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
        hasAnyData = true;
      }
      if (attributes[SpanAttributeKeys.AI_RESPONSE_TEXT]) {
        response.text = attributes[SpanAttributeKeys.AI_RESPONSE_TEXT];
        hasAnyData = true;
      }
      if (attributes[SpanAttributeKeys.AI_RESPONSE_OBJECT]) {
        try {
          response.schema = JSON.parse(
            attributes[SpanAttributeKeys.AI_RESPONSE_OBJECT]
          );
          hasAnyData = true;
        } catch (_error) {
          void _error;
        }
      }
      if (Object.keys(response).length > 0) {
        transformed.response = response;
      }

      const usage: Record<string, any> = {};
      if (
        attributes[SpanAttributeKeys.GEN_AI_USAGE_INPUT_TOKENS] ||
        attributes[SpanAttributeKeys.AI_USAGE_PROMPT_TOKENS]
      ) {
        usage.inputTokens =
          attributes[SpanAttributeKeys.GEN_AI_USAGE_INPUT_TOKENS] ||
          attributes[SpanAttributeKeys.AI_USAGE_PROMPT_TOKENS];
        hasAnyData = true;
      }
      if (
        attributes[SpanAttributeKeys.GEN_AI_USAGE_OUTPUT_TOKENS] ||
        attributes[SpanAttributeKeys.AI_USAGE_COMPLETION_TOKENS]
      ) {
        usage.outputTokens =
          attributes[SpanAttributeKeys.GEN_AI_USAGE_OUTPUT_TOKENS] ||
          attributes[SpanAttributeKeys.AI_USAGE_COMPLETION_TOKENS];
        hasAnyData = true;
      }
      if (attributes[SpanAttributeKeys.GEN_AI_USAGE_COST]) {
        usage.cost = attributes[SpanAttributeKeys.GEN_AI_USAGE_COST];
        hasAnyData = true;
      }
      if (Object.keys(usage).length > 0) {
        transformed.usage = usage;
      }

      return hasAnyData ? transformed : null;
    } catch (_error) {
      return null;
    }
  }
}

