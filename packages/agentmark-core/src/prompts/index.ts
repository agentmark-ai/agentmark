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
    protected readonly path?: K,
    protected readonly testSettings?: TestSettings,
    protected readonly loader?: Loader<T>
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

  formatWithTestSettings(options: AdaptOptions): Promise<any> {
    console.log("testSettings", this.testSettings);
    if (!this.testSettings?.props) {
      throw new Error(
        "Test settings are not defined for this prompt. Please provide valid test settings."
      );
    }
    return this.format({
      props: this.testSettings?.props,
      ...options,
    });
  }

  formatWithDatasetStream(options?: AdaptOptions): ReadableStream<any> {
    if (!this.loader || !this.testSettings?.dataset) {
      throw new Error(
        "Loader or dataset is not defined for this prompt. Please provide valid loader and dataset."
      );
    }
    const datasetStream = this.loader?.loadDataset(this.testSettings?.dataset);
    return new ReadableStream({
      start: async (controller) => {
        try {
          for await (const value of datasetStream) {
            const formattedOutput = await this.format({
              props: value.input,
              ...options,
            });
            controller.enqueue(formattedOutput);
          }
          controller.close();
        } catch (error) {
          console.error(
            "Error processing dataset stream in BasePrompt:",
            error
          );
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
  K extends KeysWithKind<T, "object"> & string
> extends BasePrompt<T, A, K, ObjectConfig> {
  constructor(
    tpl: unknown,
    eng: TemplateEngine,
    ad: A,
    path?: K,
    testSettings?: TestSettings,
    loader?: Loader<T>
  ) {
    super(tpl, eng, ad, path, testSettings, loader);
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
  constructor(
    tpl: unknown,
    eng: TemplateEngine,
    ad: A,
    path?: K,
    testSettings?: TestSettings,
    loader?: Loader<T>
  ) {
    super(tpl, eng, ad, path, testSettings, loader);
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
  constructor(
    tpl: unknown,
    eng: TemplateEngine,
    ad: A,
    path?: K,
    testSettings?: TestSettings,
    loader?: Loader<T>
  ) {
    super(tpl, eng, ad, path, testSettings, loader);
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
  K extends KeysWithKind<T, "speech"> & string
> extends BasePrompt<T, A, K, SpeechConfig> {
  constructor(
    tpl: unknown,
    eng: TemplateEngine,
    ad: A,
    path?: K,
    testSettings?: TestSettings,
    loader?: Loader<T>
  ) {
    super(tpl, eng, ad, path, testSettings, loader);
  }

  async format({
    props,
    ...options
  }: PromptFormatParams<T[K]["input"]>): Promise<ReturnType<A["adaptSpeech"]>> {
    const compiled = await this.compile(props);
    return this.adapter.adaptSpeech(compiled, options);
  }
}
