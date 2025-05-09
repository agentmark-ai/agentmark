import {
  Adapter,
  AdaptOptions,
  PromptMetadata,
  TemplateEngine,
  ObjectConfig,
  ImageConfig,
  TextConfig,
  PromptShape,
  PromptKey,
} from '../types';

export abstract class BasePrompt<
  T extends PromptShape<T>,
  A,
  K extends PromptKey<T>,
  C,
> {
  public readonly templateEngine: TemplateEngine;

  protected constructor(
    public readonly template: unknown,
    engine: TemplateEngine,
    protected readonly adapter: A,
    protected readonly path: K,
  ) {
    this.templateEngine = engine;
  }

  protected compile(props: T[K]['input']): Promise<C> {
    return this.templateEngine.compile<C, T[K]['input']>(this.template, props);
  }

  protected metadata(props: T[K]['input']): PromptMetadata {
    return { props, path: this.path, template: this.template };
  }
}

type PromptFormatParams<T> = {
  props?: T,
} & AdaptOptions;


export class ObjectPrompt<
  T extends PromptShape<T>,
  A extends Adapter<T>,
  K extends PromptKey<T>,
> extends BasePrompt<T, A, K, ObjectConfig> {

  constructor(
    tpl: unknown,
    eng: TemplateEngine,
    ad: A,
    path: K,
  ) {
    super(tpl, eng, ad, path);
  }

  async format(
    { props, ...options }: PromptFormatParams<T[K]['input']>,
  ): Promise<ReturnType<A['adaptObject']>> {
    const compiled = await this.compile(props);
    return this.adapter.adaptObject<K>(
      compiled,
      options,
      this.metadata(props),
    );
  }
}

export class TextPrompt<
  T extends PromptShape<T>,
  A extends Adapter<T>,
  K extends PromptKey<T>,
> extends BasePrompt<T, A, K, TextConfig> {

  constructor(
    tpl: unknown,
    eng: TemplateEngine,
    ad: A,
    path: K,
  ) {
    super(tpl, eng, ad, path);
  }

  async format(
    { props, ...options }: PromptFormatParams<T[K]['input']>,
  ): Promise<ReturnType<A['adaptText']>> {
    const compiled = await this.compile(props);
    return this.adapter.adaptText(
      compiled,
      options,
      this.metadata(props),
    );
  }
}

export class ImagePrompt<
  T extends PromptShape<T>,
  A extends Adapter<T>,
  K extends PromptKey<T>,
> extends BasePrompt<T, A, K, ImageConfig> {

  constructor(
    tpl: unknown,
    eng: TemplateEngine,
    ad: A,
    path: K,
  ) {
    super(tpl, eng, ad, path);
  }

  async format(
    { props, ...options }: PromptFormatParams<T[K]['input']>,
  ): Promise<ReturnType<A['adaptImage']>> {
    const compiled = await this.compile(props);
    return this.adapter.adaptImage(
      compiled,
      options,
      this.metadata(props),
    );
  }
}