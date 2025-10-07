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
  PK extends PromptKind
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

  formatWithTestProps(
    options?: AdaptOptions
  ): Promise<ReturnType<A[`adapt${Capitalize<PK>}`]>> {
    return this.format({
      props: this.testSettings?.props || {},
      ...(options ?? {}),
    });
  }

  async formatWithDataset(
    options?: AdaptOptions & { datasetPath?: string; format?: 'ndjson' | 'json' }
  ): Promise<
    ReadableStream<{
      dataset: {
        input: Record<string, any>;
        expected_output?: string;
      };
      formatted: ReturnType<A[`adapt${Capitalize<PK>}`]>;
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

    // Helper function to convert ReadableStream to async iterable if needed
    const makeAsyncIterable = (stream: any): AsyncIterable<any> => {
      // If already async iterable, return as-is
      if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
        return stream;
      }
      // If it's a ReadableStream-like object with getReader, convert it
      if (stream && typeof stream.getReader === 'function') {
        return {
          async *[Symbol.asyncIterator]() {
            const reader = stream.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                yield value;
              }
            } finally {
              if (typeof reader.releaseLock === 'function') {
                reader.releaseLock();
              }
            }
          }
        };
      }
      // Fallback: return as-is and hope for the best
      return stream;
    };

    const asyncDataset = makeAsyncIterable(datasetStream);

    if (options?.format === 'json') {
      const buffered: Array<{ input: Record<string, any>; expected_output?: string }> = [];
      for await (const value of asyncDataset) buffered.push(value);
      return new ReadableStream({
        start: async (controller) => {
          try {
            for (const value of buffered) {
              const formattedOutput = await this.format({ props: value.input, ...options });
              controller.enqueue({
                dataset: { input: value.input, expected_output: value.expected_output },
                evals: this.testSettings?.evals || [],
                formatted: formattedOutput,
              });
            }
            controller.close();
          } catch (error) {
            console.error("Error processing buffered dataset:", error);
          }
        },
      });
    }
    return new ReadableStream({
      start: async (controller) => {
        try {
          for await (const value of asyncDataset) {
            const formattedOutput = await this.format({
              props: value.input,
              ...options,
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
      cancel: (reason) => {
        if (datasetStream && typeof datasetStream.cancel === 'function') {
          datasetStream.cancel(reason);
        }
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
> extends BasePrompt<T, A, K, ObjectConfig, "object"> {
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
> extends BasePrompt<T, A, K, TextConfig, "text"> {
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
> extends BasePrompt<T, A, K, ImageConfig, "image"> {
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
> extends BasePrompt<T, A, K, SpeechConfig, "speech"> {
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
