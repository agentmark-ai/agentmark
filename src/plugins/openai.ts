import {
  ChatCompletionCreateParams,
} from "openai/resources";
import { ModelPlugin } from "../model-plugin";
import { PromptDX } from "../runtime";
import { getEnv, toFrontMatter } from "../utils";
import { Output } from "../types";
import { generateText, generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

export class OpenAIChatPlugin extends ModelPlugin<ChatCompletionCreateParams> {
  constructor() {
    super("openai");
  }

  /**
   * Serializes OpenAI ChatCompletionParams and a name into a serialized MDX file.
   * The frontmatter contains the YAML representation of the JSON standard,
   * and the messages are included in the body wrapped with JSX tags.
   */
  serialize(
    completionParams: ChatCompletionCreateParams,
    name: string
  ): string {
    const { model, messages, ...settings } = completionParams;

    // Construct the frontMatterData with the model under metadata.model
    const frontMatterData = {
      name: name,
      metadata: {
        model: {
          name: model,
          settings: settings || {},
        },
      },
      tools: completionParams.tools || {},
      schema: completionParams.schema || {},
    };

    const frontMatter = toFrontMatter(frontMatterData);

    // Serialize messages into the body with JSX tags
    const messageBody = messages
      .map((message) => {
        const role = message.role;
        const JSXTag = role.charAt(0).toUpperCase() + role.slice(1);
        return `<${JSXTag}>${message.content}</${JSXTag}>`;
      })
      .join("\n");

    return `${frontMatter}\n${messageBody}`;
  }

  /**
   * Deserializes a PromptDX object into ChatCompletionCreateParams.
   */
  deserialize(promptDX: PromptDX): ChatCompletionCreateParams {
    // Extract properties from PromptDX
    const {
      name,
      metadata,
      tools,
      schema,
      messages,
      ...otherSettings
    } = promptDX;

    // Extract model name and settings from metadata
    const modelName = metadata?.model?.name;
    const modelSettings = metadata?.model?.settings || {};

    if (!modelName) {
      throw new Error("Model name is missing in metadata.model.name");
    }

    // Reconstruct ChatCompletionCreateParams
    const completionParams: ChatCompletionCreateParams = {
      model: modelName,
      messages: messages,
      tools: tools,
      schema: schema,
      ...modelSettings, // Include model-specific settings
      ...otherSettings, // Include any other settings
    };

    return completionParams;
  }

  /**
   * Runs inference using the appropriate Vercel AI SDK method based on the presence of 'schema'.
   */
  async runInference(completionParams: ChatCompletionCreateParams): Promise<Output[]> {
    const apiKey = this.apiKey || getEnv("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("No API key provided");
    }

    const openai = createOpenAI({
      apiKey,
      fetch: async (url, options) => {
        console.log('URL', url);
        console.log('Headers', JSON.stringify(options!.headers, null, 2));
        console.log(
          `Body ${JSON.stringify(JSON.parse(options!.body! as string), null, 2)}`
        );
        return await fetch(url, options);
      },
    });

    const { model, messages, tools, schema, ...modelSettings } = completionParams;

    // Apply model-specific settings
    const openaiModel = openai(model, modelSettings);

    // Determine whether to use generateText or generateObject
    if (schema && Object.keys(schema).length > 0) {
      // Use generateObject
      const zodSchema = z.object(schema.properties);
      const { object } = await generateObject({
        model: openaiModel,
        messages: messages,
        tools: tools,
        schema: zodSchema,
      });
      return [
        {
          output_type: "execute_result",
          data: object,
          execution_count: 0,
          metadata: {},
        },
      ];
    } else {
      // Use generateText
      const { text } = await generateText({
        model: openaiModel,
        messages: messages,
        tools: tools,
      });
      return [
        {
          output_type: "execute_result",
          data: text,
          execution_count: 0,
          metadata: {},
        },
      ];
    }
  }
}
