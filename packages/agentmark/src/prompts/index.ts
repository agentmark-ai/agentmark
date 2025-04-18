import {
  Adapter,
  AdaptOptions,
  PromptMetadata,
  TemplateEngine,
  ObjectConfig,
  ImageConfig,
  TextConfig,
} from '../types';

export abstract class BasePrompt<
  T extends Record<string, { input: any; output: any }>,
  A extends Adapter<T>,
  K extends keyof T & string,
  C,
  M extends 'adaptObject' | 'adaptText' | 'adaptImage',
> {
  /** Exposed so the older codebase keeps compiling */
  public readonly templateEngine: TemplateEngine;

  protected constructor(
    public readonly template: unknown,
    engine: TemplateEngine,
    protected readonly adapter: A,
    protected readonly path: K,
    private readonly method: M,
  ) {
    this.templateEngine = engine;
  }

  async format(
    props: T[K]['input'],
    options: AdaptOptions = {},
  ): Promise<T[K]['output']> {
    const compiled = await this.templateEngine
      .compile<C, T[K]['input']>(this.template, props);

    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    return (this.adapter[this.method] as any)(
      compiled, options, metadata,
    ) as T[K]['output'];
  }
}

export class ObjectPrompt<
  T extends Record<string, { input: any; output: any }>,
  A extends Adapter<T>,
  K extends keyof T & string
> extends BasePrompt<T, A, K, ObjectConfig, 'adaptObject'> {
  constructor(tpl: unknown, eng: TemplateEngine, ad: A, path: K) {
    super(tpl, eng, ad, path, 'adaptObject');
  }
}

export class TextPrompt<
  T extends Record<string, { input: any; output: any }>,
  A extends Adapter<T>,
  K extends keyof T & string
> extends BasePrompt<T, A, K, TextConfig, 'adaptText'> {
  constructor(tpl: unknown, eng: TemplateEngine, ad: A, path: K) {
    super(tpl, eng, ad, path, 'adaptText');
  }
}

export class ImagePrompt<
  T extends Record<string, { input: any; output: any }>,
  A extends Adapter<T>,
  K extends keyof T & string
> extends BasePrompt<T, A, K, ImageConfig, 'adaptImage'> {
  constructor(tpl: unknown, eng: TemplateEngine, ad: A, path: K) {
    super(tpl, eng, ad, path, 'adaptImage');
  }
}