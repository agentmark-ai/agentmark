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
} from "../types";

export abstract class BasePrompt<
  T extends PromptShape<T>,
  A,
  K extends PromptKey<T>,
  C
> {
  public readonly templateEngine: TemplateEngine;

  protected constructor(
    public readonly template: unknown,
    engine: TemplateEngine,
    protected readonly adapter: A,
    protected readonly path?: K
  ) {
    this.templateEngine = engine;
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

  formatWithDatasetStream(
    datasetStream: ReadableStream<Record<string, unknown>>,
    options?: AdaptOptions
  ): ReadableStream<any> {
    const reader = datasetStream.getReader();

    return new ReadableStream({
      start: async (controller) => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            const formattedOutput = await this.format({
              props: value,
              ...options,
            });
            controller.enqueue(formattedOutput);
          }
        } catch (error) {
          console.error(
            "Error processing dataset stream in BasePrompt:",
            error
          );
        }
      },
      cancel: (reason) => {
        console.log("Output stream cancelled because ", reason);
        return datasetStream.cancel(reason);
      },
    });
  }
}

export type PromptFormatParams<T> = {
  props?: T;
} & AdaptOptions;

export class ObjectPrompt<
  T extends PromptShape<T>,
  A extends Adapter<T>,
  K extends KeysWithKind<T, "object"> & string
> extends BasePrompt<T, A, K, ObjectConfig> {
  constructor(tpl: unknown, eng: TemplateEngine, ad: A, path?: K) {
    super(tpl, eng, ad, path);
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
  K extends KeysWithKind<T, "text"> & string
> extends BasePrompt<T, A, K, TextConfig> {
  constructor(tpl: unknown, eng: TemplateEngine, ad: A, path?: K) {
    super(tpl, eng, ad, path);
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
  K extends KeysWithKind<T, "image"> & string
> extends BasePrompt<T, A, K, ImageConfig> {
  constructor(tpl: unknown, eng: TemplateEngine, ad: A, path?: K) {
    super(tpl, eng, ad, path);
  }

  async format({
    props,
    ...options
  }: PromptFormatParams<T[K]["input"]>): Promise<ReturnType<A["adaptImage"]>> {
    const compiled = await this.compile(props);
    return this.adapter.adaptImage(compiled, options, this.metadata(props));
  }
}

export class SpeechPrompt<
  T extends PromptShape<T>,
  A extends Adapter<T>,
  K extends KeysWithKind<T, "speech"> & string
> extends BasePrompt<T, A, K, SpeechConfig> {
  constructor(tpl: unknown, eng: TemplateEngine, ad: A, path?: K) {
    super(tpl, eng, ad, path);
  }

  async format({
    props,
    ...options
  }: PromptFormatParams<T[K]["input"]>): Promise<ReturnType<A["adaptSpeech"]>> {
    const compiled = await this.compile(props);
    return this.adapter.adaptSpeech(compiled, options, this.metadata(props));
  }
}
