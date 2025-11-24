import {
  ObjectPrompt,
  type PromptShape,
  type KeysWithKind,
  type TemplateEngine,
  type Loader,
  type TestSettings,
  type AdaptOptions,
  type RichChatMessage,
} from "@agentmark/prompt-core";
import { MastraAdapter } from "./adapter";
import {
  FormatAgentProps,
  FormatMessagesProps,
  IfShapeIsUndefined,
} from "./types";
import { z } from "zod";

export class MastraObjectPrompt<
  T extends PromptShape<T> | undefined,
  A extends MastraAdapter<T, any>,
  K extends IfShapeIsUndefined<T, any, KeysWithKind<T, "object"> & string>
> extends ObjectPrompt<any, A, K> {
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
    UsedProps extends Partial<T[K]["input"]> = Record<string, never>
  >(params?: {
    props?: FormatAgentProps<T, UsedProps, K>;
    options?: AdaptOptions;
  }) {
    const { props, options } = params || {};
    const input = await this.compile(props);

    const adaptedAgent = this.adapter.adaptObject(input, options ?? {});

    const formatMessages = async <M extends Partial<T[K]["input"]>>(msgParams?: {
      props?: FormatMessagesProps<T, UsedProps, M, K>;
    }): Promise<
      [
        RichChatMessage[],
        ReturnType<typeof adaptedAgent.adaptMessages>["options"] & {
          output: z.ZodType<T[K]["output"]>;
        }
      ]
    > => {
      const messageInput = await this.compile(msgParams?.props as any);
      const messageAdapted = adaptedAgent.adaptMessages({
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
      options,
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
        ReturnType<MastraObjectPrompt<T, A, K>["formatAgent"]>
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
              options,
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
