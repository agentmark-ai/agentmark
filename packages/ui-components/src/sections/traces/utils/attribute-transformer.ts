export const transformAttributes = (attributes: Record<string, any>) => {
  try {
    const transformed: Record<string, any> = {};

    // Operation Info
    if (attributes["ai.operationId"]) {
      transformed.operation = {
        id: attributes["ai.operationId"],
        name: attributes["operation.name"],
      };
    }

    // Model Info (if exists)
    if (attributes["gen_ai.request.model"] || attributes["ai.model.id"]) {
      transformed.model = {
        id: attributes["gen_ai.request.model"] || attributes["ai.model.id"],
        provider: attributes["ai.model.provider"],
      };
    }

    // Settings (if exists)
    const settings: Record<string, any> = {};
    if (
      attributes["gen_ai.request.max_tokens"] ||
      attributes["ai.settings.maxTokens"]
    ) {
      settings.maxTokens =
        attributes["gen_ai.request.max_tokens"] ||
        attributes["ai.settings.maxTokens"];
    }
    if (
      attributes["gen_ai.request.temperature"] ||
      attributes["ai.settings.temperature"]
    ) {
      settings.temperature =
        attributes["gen_ai.request.temperature"] ||
        attributes["ai.settings.temperature"];
    }
    if (attributes["gen_ai.request.top_p"] || attributes["ai.settings.topP"]) {
      settings.topP =
        attributes["gen_ai.request.top_p"] || attributes["ai.settings.topP"];
    }
    if (
      attributes["gen_ai.request.presence_penalty"] ||
      attributes["ai.settings.presencePenalty"]
    ) {
      settings.presencePenalty =
        attributes["gen_ai.request.presence_penalty"] ||
        attributes["ai.settings.presencePenalty"];
    }
    if (Object.keys(settings).length > 0) {
      transformed.settings = settings;
    }

    // Tool Call Info
    if (attributes["ai.toolCall.name"]) {
      transformed.tool = {
        name: attributes["ai.toolCall.name"],
        id: attributes["ai.toolCall.id"],
        args: attributes["ai.toolCall.args"]
          ? JSON.parse(attributes["ai.toolCall.args"])
          : undefined,
        result: attributes["ai.toolCall.result"],
      };
    }

    // Metadata
    const metadata: Record<string, any> = {};
    Object.entries(attributes).forEach(([key, value]) => {
      if (key.startsWith("ai.telemetry.metadata.")) {
        const metadataKey = key.replace("ai.telemetry.metadata.", "");
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
    if (attributes["ai.telemetry.metadata.props"]) {
      transformed.props = JSON.parse(attributes["ai.telemetry.metadata.props"]);
    }

    // Response (if exists)
    const response: Record<string, any> = {};
    if (
      attributes["ai.response.finishReason"] ||
      attributes["gen_ai.response.finish_reasons"]
    ) {
      response.finishReason =
        attributes["ai.response.finishReason"] ||
        attributes["gen_ai.response.finish_reasons"];
    }
    if (attributes["ai.response.text"]) {
      response.text = attributes["ai.response.text"];
    }
    if (attributes["ai.response.object"]) {
      response.schema = JSON.parse(attributes["ai.response.object"]);
    }
    if (Object.keys(response).length > 0) {
      transformed.response = response;
    }

    // Usage (if exists)
    const usage: Record<string, any> = {};
    if (
      attributes["gen_ai.usage.input_tokens"] ||
      attributes["ai.usage.promptTokens"]
    ) {
      usage.inputTokens =
        attributes["gen_ai.usage.input_tokens"] ||
        attributes["ai.usage.promptTokens"];
    }
    if (
      attributes["gen_ai.usage.output_tokens"] ||
      attributes["ai.usage.completionTokens"]
    ) {
      usage.outputTokens =
        attributes["gen_ai.usage.output_tokens"] ||
        attributes["ai.usage.completionTokens"];
    }
    if (attributes["gen_ai.usage.cost"]) {
      usage.cost = attributes["gen_ai.usage.cost"];
    }
    if (Object.keys(usage).length > 0) {
      transformed.usage = usage;
    }

    return transformed;
  } catch (_error) {
    return attributes;
  }
};
