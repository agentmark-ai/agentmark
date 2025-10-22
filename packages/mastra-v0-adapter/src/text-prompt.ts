import type {
  AdaptOptions,
  PromptShape,
  KeysWithKind,
  TemplateEngine,
  Loader,
  TestSettings,
  RichChatMessage,
} from "../../prompt-core/dist";
import { TextPrompt } from "../../prompt-core/dist";
import type { MastraAdapter } from "./adapter";
import {
  FormatAgentProps,
  FormatMessagesProps,
  IfShapeIsUndefined,
} from "./types";
import { AgentConfig, AgentGenerateOptions } from "@mastra/core/agent";
import { MastraToolRegistry } from "./tool-registry";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

type ToolRet<R> = R extends { __tools: { output: infer O } } ? O : never;
type ToolInput<R> = R extends { __tools: { input: infer I } } ? I : never;

type CreateTool<
  InputSchema extends z.ZodType,
  OutputSchema extends z.ZodType
> = ReturnType<typeof createTool<InputSchema, OutputSchema>>;

export class MastraTextPrompt<
  T extends PromptShape<T> | undefined,
  TR extends MastraToolRegistry<any, any>,
  A extends MastraAdapter<T, TR>,
  K extends IfShapeIsUndefined<T, any, KeysWithKind<T, "text"> & string>
> extends TextPrompt<any, A, K> {
  constructor(
    tpl: unknown,
    eng: TemplateEngine,
    ad: A,
    path?: K,
    testSettings?: TestSettings,
    loader?: Loader<any>
  ) {
    super(tpl, eng, ad, path, testSettings, loader);
  }

  async formatAgent<
    UsedProps extends Partial<T[K]["input"]> = {}
  >(params?: {
    props?: FormatAgentProps<T, UsedProps, K>;
    options?: AdaptOptions;
  }): Promise<
    AgentConfig<
      any,
      {
        [key in keyof ToolInput<TR>]: CreateTool<
          z.ZodType<ToolInput<TR>[key]["args"]>,
          z.ZodType<ToolRet<TR>[key]>
        >;
      }
    > & {
      formatMessages: <M extends Partial<T[K]["input"]>>(msgParams?: {
        props?: FormatMessagesProps<T, UsedProps, M, K>;
      }) => Promise<
        [
          RichChatMessage[],
          AgentGenerateOptions<undefined, undefined> & {
            output?: never;
            experimental_output?: never;
          }
        ]
      >;
    }
  > {
    const { props, options } = params || {};
    const input = await this.compile(props);

    const { adaptMessages, ...adaptedAgent } = await this.adapter.adaptText(
      input,
      options ?? {}
    );

    const formatMessages = async <
      M extends Partial<T[K]["input"]>
    >(msgParams?: {
      props?: FormatMessagesProps<T, UsedProps, M, K>;
    }): Promise<
      [
        RichChatMessage[],
        AgentGenerateOptions<undefined, undefined> & {
          output?: never;
          experimental_output?: never;
        }
      ]
    > => {
      const messageInput = await this.compile(msgParams?.props as any);
      const messageAdapted = adaptMessages({
        input: messageInput,
        options: options ?? {},
        metadata: this.metadata({
          ...(props || {}),
          ...((msgParams && msgParams.props) || {}),
        }),
      });

      return [messageAdapted.messages, messageAdapted.options];
    };

    return {
      ...adaptedAgent,
      formatMessages,
    };
  }

  formatAgentWithTestProps(options: AdaptOptions) {
    return this.formatAgent({
      props: (this.testSettings?.props as any) || ({} as any),
      ...(options || {}),
    });
  }

  async formatAgentWithDataset(
    options?: AdaptOptions & { datasetPath?: string }
  ): Promise<
    ReadableStream<{
      dataset: {
        input: Record<string, unknown>;
        expected_output?: string;
      };
      formatted: Awaited<
        ReturnType<MastraTextPrompt<T, TR, A, K>["formatAgent"]>
      >;
      evals: string[];
    }>
  > {
    if (
      !this.loader ||
      (!this.testSettings?.dataset && !options?.datasetPath)
    ) {
      throw new Error(
        "Loader or dataset is not defined for this prompt. Please provide valid loader and dataset."
      );
    }

    const dsPath = options?.datasetPath || this.testSettings?.dataset;

    const datasetStream = await this.loader?.loadDataset(dsPath!);
    return new ReadableStream({
      start: async (controller) => {
        try {
          for await (const value of datasetStream) {
            const formattedOutput = await this.formatAgent({
              props: value.input as any,
              ...(options || {}),
            });
            controller.enqueue({
              dataset: {
                input: value.input,
                expected_output: value.expected_output,
              },
              evals: this.testSettings?.evals || [],
              formatted: formattedOutput,
            });
          }
          controller.close();
        } catch (error) {
          console.error("Error processing dataset stream:", error);
        }
      },
      cancel: (reason) => datasetStream.cancel(reason),
    });
  }

}
