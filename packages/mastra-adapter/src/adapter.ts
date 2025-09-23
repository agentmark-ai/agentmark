import type {
  Adapter,
  TextConfig,
  ObjectConfig,
  PromptShape,
  PromptMetadata,
  AdaptOptions,
  RichChatMessage,
} from "@agentmark/agentmark-core";
import { MastraModelRegistry } from "./model-registry";
import { MastraToolRegistry } from "./tool-registry";
import { AgentConfig, AgentGenerateOptions } from "@mastra/core/agent";
import { resolveSerializedZodOutput } from "@mastra/core/utils";
import { parseSchema } from "json-schema-to-zod";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function getTelemetryConfig(
  telemetry: AdaptOptions["telemetry"],
  props: Record<string, any>,
  promptName: string,
  agentmarkMeta?: Record<string, any>
) {
  return telemetry
    ? {
        ...telemetry,
        metadata: {
          ...telemetry.metadata,
          prompt: promptName,
          props: JSON.stringify(props ?? {}),
          ...(agentmarkMeta ? { ...agentmarkMeta } : {}),
        },
      }
    : undefined;
}

const extractInstructions = (messages: TextConfig["messages"]) => {
  return messages.find((i) => i.role === "system")?.content;
};

const extractMessages = (messages: TextConfig["messages"]) => {
  return messages.filter((i) => i.role !== "system");
};

export class MastraAdapter<
  T extends PromptShape<T> | undefined,
  TR extends MastraToolRegistry<any, any> = MastraToolRegistry<any, any>
> implements Adapter<any>
{
  declare readonly __dict: T;
  readonly __name = "mastra";

  constructor(
    private modelRegistry: MastraModelRegistry,
    private toolRegistry?: TR
  ) {}

  adaptText(input: TextConfig, options: AdaptOptions) {
    const agent = this.adaptTextAgent(input, options);

    return {
      ...agent,
      adaptMessages: this.adaptTextMessages,
    };
  }

  adaptObject(input: ObjectConfig, options: AdaptOptions) {
    const baseAgent = this.adaptObjectAgent(input, options);

    return {
      ...baseAgent,
      adaptMessages: ({
        input,
        options,
        metadata,
      }: {
        input: ObjectConfig;
        options: AdaptOptions;
        metadata: PromptMetadata;
      }) => this.adaptObjectMessages(input, options, metadata),
    };
  }

  adaptImage(): any {
    throw new Error("Not implemented");
  }

  adaptSpeech(): any {
    throw new Error("Not implemented");
  }

  private adaptTextAgent(input: TextConfig, options?: AdaptOptions) {
    const { model_name, tools } = input.text_config;
    const modelCreator = this.modelRegistry?.getModelFunction(model_name);
    const model = modelCreator(model_name, options ?? {});

    let toolsObj = {} as any;

    if (tools) {
      for (const [name, { description, parameters }] of Object.entries(tools)) {
        if (!this.toolRegistry?.has(name)) {
          throw new Error(`Tool ${name} not registered`);
        }
        const tool = this.toolRegistry.get(name);
        toolsObj[name] = {
          id: name,
          description,
          outputSchema: undefined as any,
          inputSchema: resolveSerializedZodOutput(parseSchema(parameters)),
          execute: (args: any) => tool(args, options?.toolContext),
        };
      }
    }

    const instructions = extractInstructions(input.messages);

    return {
      name: input.name,
      instructions: instructions!,
      model,
      tools: toolsObj,
    };
  }

  private adaptObjectAgent(
    input: ObjectConfig,
    options?: AdaptOptions
  ): AgentConfig {
    const { model_name } = input.object_config;
    const modelCreator = this.modelRegistry?.getModelFunction(model_name);
    const model = modelCreator(model_name, options ?? {});

    const instructions = extractInstructions(input.messages);

    return {
      name: input.name,
      instructions: instructions!,
      model,
    };
  }

  private adaptTextMessages({
    input,
    options,
    metadata,
  }: {
    input: TextConfig;
    options?: AdaptOptions;
    metadata: PromptMetadata;
  }): {
    messages: RichChatMessage[];
    options: AgentGenerateOptions<undefined, undefined> & {
      output?: never;
      experimental_output?: never;
    };
  } {
    const settings = input.text_config;

    const baseOptions = {
      ...(settings.temperature !== undefined
        ? { temperature: settings.temperature }
        : {}),
      ...(settings.max_tokens !== undefined
        ? { maxTokens: settings.max_tokens }
        : {}),
      ...(settings.top_p !== undefined ? { topP: settings.top_p } : {}),
      ...(settings.top_k !== undefined ? { topK: settings.top_k } : {}),
      ...(settings.presence_penalty !== undefined
        ? { presencePenalty: settings.presence_penalty }
        : {}),
      ...(settings.frequency_penalty !== undefined
        ? { frequencyPenalty: settings.frequency_penalty }
        : {}),
      ...(settings.stop_sequences !== undefined
        ? { stopSequences: settings.stop_sequences }
        : {}),
      ...(settings.seed !== undefined ? { seed: settings.seed } : {}),
      ...(options?.telemetry
        ? {
            telemetry: getTelemetryConfig(
              options?.telemetry,
              metadata.props,
              input.name,
              input.agentmark_meta
            ),
          }
        : {}),
      ...(settings.max_retries !== undefined
        ? { maxRetries: settings.max_retries }
        : {}),
      ...(settings.max_calls !== undefined
        ? { maxSteps: settings.max_calls }
        : {}),
      ...(settings.tool_choice !== undefined
        ? { toolChoice: settings.tool_choice as any }
        : {}),
    };

    return {
      messages: extractMessages(input.messages),
      options: {
        ...baseOptions,
        output: undefined,
        experimental_output: undefined,
      },
    };
  }

  private adaptObjectMessages(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ) {
    const { ...settings } = input.object_config;

    const baseOptions = {
      ...(settings.temperature !== undefined
        ? { temperature: settings.temperature }
        : {}),
      ...(settings.max_tokens !== undefined
        ? { maxTokens: settings.max_tokens }
        : {}),
      ...(settings.top_p !== undefined ? { topP: settings.top_p } : {}),
      ...(settings.top_k !== undefined ? { topK: settings.top_k } : {}),
      ...(settings.presence_penalty !== undefined
        ? { presencePenalty: settings.presence_penalty }
        : {}),
      output: resolveSerializedZodOutput(parseSchema(settings.schema)),
      ...(settings.frequency_penalty !== undefined
        ? { frequencyPenalty: settings.frequency_penalty }
        : {}),
      ...(settings.seed !== undefined ? { seed: settings.seed } : {}),
      ...(options?.telemetry
        ? {
            telemetry: getTelemetryConfig(
              options?.telemetry,
              metadata.props,
              input.name,
              input.agentmark_meta
            ),
          }
        : {}),
    };

    return {
      messages: input.messages,
      options: {
        ...baseOptions,
      },
    };
  }
}
