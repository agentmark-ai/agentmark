import { Adapter, TemplateEngine, JSONObject, PromptMetadata, ChatMessage, AdapterTextOutput, AdapterObjectOutput, AdapterImageOutput, TextConfig, ObjectConfig, ImageConfig } from "../types";

export class TextPrompt<
  Input extends JSONObject,
  T extends string,
  A extends Adapter = Adapter
> {
  protected templateEngine: TemplateEngine;
  protected adapter: A;
  protected path: string | undefined;
  public template: unknown;
  
  constructor(template: unknown, templateEngine: TemplateEngine, adapter: A, path?: string | undefined) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
    this.path = path;
  }

  async format(
    props: Input, 
    options: JSONObject = {}
  ): Promise<AdapterTextOutput<A, T>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as TextConfig;
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptText<T>(compiledTemplate, options, metadata);
    return result as AdapterTextOutput<A, T>;
  }
}

export class ObjectPrompt<
  Input extends JSONObject,
  T extends JSONObject,
  A extends Adapter = Adapter
> {
  protected templateEngine: TemplateEngine;
  protected adapter: A;
  protected path: string | undefined;
  public template: unknown;
  
  constructor(template: unknown, templateEngine: TemplateEngine, adapter: A, path?: string | undefined) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
    this.path = path;
  }

  async format(
    props: Input,
    options: JSONObject = {}
  ): Promise<AdapterObjectOutput<A, T>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as ObjectConfig;
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptObject<T>(compiledTemplate, options, metadata);
    return result as AdapterObjectOutput<A, T>;
  }
}

export class ImagePrompt<
  Input extends JSONObject,
  T extends string,
  A extends Adapter = Adapter
> {
  protected templateEngine: TemplateEngine;
  protected adapter: A;
  protected path: string | undefined;
  public template: unknown;
  
  constructor(template: unknown, templateEngine: TemplateEngine, adapter: A, path?: string | undefined) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
    this.path = path;
  }

  async format(
    props: Input,
    options: JSONObject = {}
  ): Promise<AdapterImageOutput<A, T>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as ImageConfig;
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptImage<T>(compiledTemplate, options, metadata);
    return result as AdapterImageOutput<A, T>;
  }
}