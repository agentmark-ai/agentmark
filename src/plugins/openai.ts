import {
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
} from "openai/resources";
import { ModelPlugin } from "../model-plugin";
import { PromptDX } from "../runtime";
import OpenAI from "openai";
import { getEnv, omit, toFrontMatter } from "../utils";
import {
  ExecuteResult,
  Output,
  OutputDataWithValue,
} from "../types";

export class OpenAIChatPlugin extends ModelPlugin<ChatCompletionCreateParams> {
  constructor() {
    super("openai");
  }

  deserialize(promptDX: PromptDX): ChatCompletionCreateParams {
    return refineChatCompletionParams({
      messages: promptDX.messages,
      model: promptDX.metadata.model.name,
      ...promptDX.metadata.model.settings,
    });
  }

  serialize(completionParams: ChatCompletionCreateParams, name: string): string {
    const { model, messages, ...settings } = completionParams;
    const mdxArr = [];

    const frontMatter = toFrontMatter({
      name: name,
      metadata: {
        model: {
          name: model,
          settings,
        },
      },
    });
    mdxArr.push(frontMatter);

    messages.forEach((message) => {
      const role = message.role;
      const JSXTag = role[0]!.toUpperCase() + role.slice(1);
      if (JSXTag) {
        mdxArr.push(`<${JSXTag}>${message.content}</${JSXTag}>`);
      }
    });

    return mdxArr.join('\n');
  }

  async runInference(completionParams: ChatCompletionCreateParams): Promise<Output[]> {
    const apiKey = this.apiKey || getEnv("OPENAI_API_KEY");

    if (!apiKey) {
      throw new Error("No API key provided");
    }

    const client = new OpenAI({ apiKey });
    const { stream = false } = completionParams;

    if (!stream) {
      completionParams.stream = false;
      const response = await client.chat.completions.create(
        completionParams as ChatCompletionCreateParamsNonStreaming
      );

      const outputs = response.choices
        .map((choice) => {
          const outputData = buildOutputData(choice.message);
          if (outputData == undefined) return null;

          return {
            output_type: "execute_result",
            data: outputData,
            execution_count: choice.index,
            metadata: {
              finish_reason: choice.finish_reason,
              ...omit(response, "choices"),
              raw_response: choice.message,
              ...omit(choice.message, "content", "function_call"),
            },
          } as ExecuteResult;
        })
        .filter(Boolean) as Output[];

      return outputs;
    } else {
      completionParams.stream = true;
      const responseStream = await client.chat.completions.create(
        completionParams as ChatCompletionCreateParamsStreaming
      );

      const outputs = new Map<number, ExecuteResult>();
      let messages: Map<number, ChatCompletionMessage> = new Map();

      for await (const chunk of responseStream) {
        messages = multiChoiceMessageReducer(messages, chunk);

        chunk.choices.forEach((choice) => {
          const message = messages.get(choice.index);
          if (!message) return;

          const outputData = buildOutputData(message);
          if (!outputData) return;

          const output: ExecuteResult = {
            output_type: "execute_result",
            data: outputData,
            execution_count: choice.index,
            metadata: {
              finish_reason: choice.finish_reason,
              raw_response: message,
            },
          };
          outputs.set(choice.index, output);
        });
      }

      return Array.from(outputs.values());
    }
  }
}

function refineChatCompletionParams(params: any): ChatCompletionCreateParams {
  const allowedKeys: (keyof ChatCompletionCreateParams)[] = [
    "model",
    "messages",
    "functions",
    "tools",
    "function_call",
    "temperature",
    "top_p",
    "n",
    "stream",
    "stop",
    "max_tokens",
    "presence_penalty",
    "frequency_penalty",
    "logit_bias",
    "user",
  ];

  const completionParams: Partial<ChatCompletionCreateParams> = {};

  for (const key of allowedKeys) {
    if (params[key] != null) {
      (completionParams as any)[key] = params[key];
    }
  }

  return completionParams as ChatCompletionCreateParams;
}

function reduceMessages(acc: any, delta: any): any {
  const result = { ...acc };
  for (const [key, value] of Object.entries(delta)) {
    if (result[key] == null) {
      result[key] = value;
    } else if (typeof result[key] === "string" && typeof value === "string") {
      result[key] += value;
    } else if (typeof result[key] === "object" && !Array.isArray(result[key])) {
      result[key] = reduceMessages(result[key], value);
    }
  }
  return result;
}

export function multiChoiceMessageReducer(
  messages: Map<number, ChatCompletionMessage>,
  chunk: ChatCompletionChunk
): Map<number, ChatCompletionMessage> {
  if (messages.size !== 0 && messages.size !== chunk.choices.length) {
    throw new Error(
      "Invalid number of previous choices -- it should match the incoming number of choices"
    );
  }

  chunk.choices.forEach((choice) => {
    const previousMessage = messages.get(choice.index) || {};
    const updatedMessage = reduceMessages(previousMessage, choice.delta) as ChatCompletionMessage;
    messages.set(choice.index, updatedMessage);
  });

  return messages;
}

function buildOutputData(
  message: ChatCompletionMessageParam | null
): OutputDataWithValue | string | undefined {
  if (!message) return undefined;

  if (message.content !== null) {
    if (typeof message.content === "string") {
      return message.content;
    } else if (Array.isArray(message.content)) {
      return message.content
        .map((msg) => {
          if (msg.type === "text") return msg.text;
          if (msg.type === "image_url") return msg.image_url;
          return undefined;
        })
        .join("\n");
    }
  } else if (message.role === "assistant") {
    const tool = message.tool_calls?.[0];
    if (tool?.type === "function") {
      return {
        kind: "tool_calls",
        value: [{ type: "function", function: tool.function }],
      } as OutputDataWithValue;
    }
  }
  return undefined;
}
