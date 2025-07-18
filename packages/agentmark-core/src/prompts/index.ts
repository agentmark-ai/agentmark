import { FileLoader } from "../loaders/file";
import type {
  Adapter,
  AdaptOptions,
  PromptMetadata,
  TemplateEngine,
  ObjectConfig,
  ImageConfig,
  TextConfig,
  PromptShape,
  PromptKey,
  KeysWithKind,
  SpeechConfig,
  TestSettings,
  Loader,
  PromptKind,
} from "../types";

export abstract class BasePrompt<
  T extends PromptShape<T>,
  A extends Adapter<T>,
  K extends PromptKey<T>,
  C,
  PK extends PromptKind,
  Context = unknown
> {
  public readonly templateEngine: TemplateEngine;
  public readonly context?: Context;

  protected constructor(
    public readonly template: unknown,
    engine: TemplateEngine,
    protected readonly adapter: A,
    protected readonly path?: K,
    protected readonly testSettings?: TestSettings,
    protected readonly loader?: Loader<T, unknown>,
    context?: Context
  ) {
    this.templateEngine = engine;
    this.context = context;
  }

  protected compile(props: T[K]["input"]): Promise<C> {
    return this.templateEngine.compile<C, T[K]["input"]>({
      template: this.template,
      props,
    });
  }

  protected metadata(props: T[K]["input"]): PromptMetadata {
    return { props, path: this.path, template: this.template };
  }

  abstract format(params: PromptFormatParams<T[K]["input"]>): Promise<any>;

  formatWithTestProps(
    options: AdaptOptions
  ): Promise<ReturnType<A[`adapt${Capitalize<PK>}`]>> {
    return this.format({
      props: this.testSettings?.props || {},
      ...options,
    });
  }

  async formatWithDataset(
    options?: AdaptOptions & { datasetPath?: string }
  ): Promise<
    ReadableStream<{
      dataset: {
        input: Record<string, any>;
        expected_output?: string;
      };
      formatted: ReturnType<A[`adapt${Capitalize<PK>}`]>;
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
            const formattedOutput = await this.format({
              props: value.input,
              ...options,
            });
            controller.enqueue({
              dataset: {
                input: value.input,
                expected_output: value.expected_output,
              },
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

export type PromptFormatParams<T> = {
  props?: T;
} & AdaptOptions;

export class ObjectPrompt<
  T extends PromptShape<T>,
  A extends Adapter<T>,
  K extends KeysWithKind<T, "object"> & string,
  Context = unknown
> extends BasePrompt<T, A, K, ObjectConfig, "object", Context> {
  constructor(
    tpl: unknown,
    eng: TemplateEngine,
    ad: A,
    path?: K,
    testSettings?: TestSettings,
    loader?: Loader<T, unknown>,
    context?: Context
  ) {
    super(tpl, eng, ad, path, testSettings, loader, context);
  }

  async format({
    props,
    ...options
  }: PromptFormatParams<T[K]["input"]>): Promise<ReturnType<A["adaptObject"]>> {
    const compiled = await this.compile(props);
    return this.adapter.adaptObject(compiled, options, this.metadata(props));
  }
}

export class TextPrompt<
  T extends PromptShape<T>,
  A extends Adapter<T>,
  K extends KeysWithKind<T, "text"> & string,
  Context = unknown
> extends BasePrompt<T, A, K, TextConfig, "text", Context> {
  constructor(
    tpl: unknown,
    eng: TemplateEngine,
    ad: A,
    path?: K,
    testSettings?: TestSettings,
    loader?: Loader<T, unknown>,
    context?: Context
  ) {
    super(tpl, eng, ad, path, testSettings, loader, context);
  }

  async format({
    props,
    ...options
  }: PromptFormatParams<T[K]["input"]>): Promise<ReturnType<A["adaptText"]>> {
    const compiled = await this.compile(props);
    return this.adapter.adaptText<K>(compiled, options, this.metadata(props));
  }
}

export class ImagePrompt<
  T extends PromptShape<T>,
  A extends Adapter<T>,
  K extends KeysWithKind<T, "image"> & string,
  Context = unknown
> extends BasePrompt<T, A, K, ImageConfig, "image", Context> {
  constructor(
    tpl: unknown,
    eng: TemplateEngine,
    ad: A,
    path?: K,
    testSettings?: TestSettings,
    loader?: Loader<T, unknown>,
    context?: Context
  ) {
    super(tpl, eng, ad, path, testSettings, loader, context);
  }

  async format({
    props,
    ...options
  }: PromptFormatParams<T[K]["input"]>): Promise<ReturnType<A["adaptImage"]>> {
    const compiled = await this.compile(props);
    return this.adapter.adaptImage(compiled, options);
  }
}

export class SpeechPrompt<
  T extends PromptShape<T>,
  A extends Adapter<T>,
  K extends KeysWithKind<T, "speech"> & string,
  Context = unknown
> extends BasePrompt<T, A, K, SpeechConfig, "speech", Context> {
  constructor(
    tpl: unknown,
    eng: TemplateEngine,
    ad: A,
    path?: K,
    testSettings?: TestSettings,
    loader?: Loader<T, unknown>,
    context?: Context
  ) {
    super(tpl, eng, ad, path, testSettings, loader, context);
  }

  async format({
    props,
    ...options
  }: PromptFormatParams<T[K]["input"]>): Promise<ReturnType<A["adaptSpeech"]>> {
    const compiled = await this.compile(props);
    return this.adapter.adaptSpeech(compiled, options);
  }
}
