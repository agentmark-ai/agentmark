import { SpanData } from "@/sections/traces/types";
import { AttributeTransformer } from "../attribute-transformer-registry";

export class NormalizedTransformer implements AttributeTransformer {
  transform(
    _attributes: Record<string, any>,
    normalizedData?: SpanData["data"]
  ): Record<string, any> | null {
    if (!normalizedData) {
      return null;
    }

    const transformed: Record<string, any> = {};
    let hasAnyData = false;

    if (normalizedData.model) {
      transformed.model = {
        id: normalizedData.model,
      };
      hasAnyData = true;
    }

    if (normalizedData.settings) {
      try {
        const settings =
          typeof normalizedData.settings === "string"
            ? JSON.parse(normalizedData.settings)
            : normalizedData.settings;
        if (settings && Object.keys(settings).length > 0) {
          transformed.settings = settings;
          hasAnyData = true;
        }
      } catch (_error) {
        void _error;
      }
    }

    const usage: Record<string, any> = {};
    if (normalizedData.inputTokens !== undefined) {
      usage.inputTokens = normalizedData.inputTokens;
      hasAnyData = true;
    }
    if (normalizedData.outputTokens !== undefined) {
      usage.outputTokens = normalizedData.outputTokens;
      hasAnyData = true;
    }
    if (normalizedData.cost !== undefined) {
      usage.cost = normalizedData.cost;
      hasAnyData = true;
    }
    if (Object.keys(usage).length > 0) {
      transformed.usage = usage;
    }

    const response: Record<string, any> = {};
    if (normalizedData.finishReason) {
      response.finishReason = normalizedData.finishReason;
      hasAnyData = true;
    }
    if (normalizedData.output) {
      response.text = normalizedData.output;
      hasAnyData = true;
    }
    if (normalizedData.outputObject) {
      try {
        const outputObject =
          typeof normalizedData.outputObject === "string"
            ? JSON.parse(normalizedData.outputObject)
            : normalizedData.outputObject;
        if (outputObject) {
          response.schema = outputObject;
          hasAnyData = true;
        }
      } catch (_error) {
        void _error;
      }
    }
    if (Object.keys(response).length > 0) {
      transformed.response = response;
    }

    if (normalizedData.toolCalls) {
      try {
        const toolCalls =
          typeof normalizedData.toolCalls === "string"
            ? JSON.parse(normalizedData.toolCalls)
            : normalizedData.toolCalls;
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          const firstTool = toolCalls[0];
          transformed.tool = {
            name: firstTool.toolName || firstTool.name,
            id: firstTool.toolCallId || firstTool.id,
            args: firstTool.args || firstTool.input,
            result: firstTool.result,
          };
          hasAnyData = true;
        }
      } catch (_error) {
        void _error;
      }
    }

    if (normalizedData.props) {
      try {
        const props =
          typeof normalizedData.props === "string"
            ? JSON.parse(normalizedData.props)
            : normalizedData.props;
        transformed.props = props;
        hasAnyData = true;
      } catch {
        transformed.props = normalizedData.props;
        hasAnyData = true;
      }
    }

    if (normalizedData.metadata) {
      try {
        const metadata =
          typeof normalizedData.metadata === "string"
            ? JSON.parse(normalizedData.metadata)
            : normalizedData.metadata;
        if (metadata && Object.keys(metadata).length > 0) {
          transformed.metadata = metadata;
          hasAnyData = true;
        }
      } catch (_error) {
        void _error;
      }
    }

    return hasAnyData ? transformed : null;
  }
}

