import { Adapter, TemplateEngine, JSONObject, PromptMetadata, ChatMessage, AdapterTextOutput, AdapterObjectOutput, AdapterImageOutput } from "../types";

export class TextPrompt<
  Input extends JSONObject,
  Output extends string,
  A extends Adapter = Adapter
> {
  protected templateEngine: TemplateEngine;
  protected adapter: A;
  protected path: string | undefined;
  public template: any;
  constructor(template: any, templateEngine: TemplateEngine, adapter: A, path?: string | undefined) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
    this.path = path;
  }

  async format(
    props: Input, 
    options: JSONObject = {}
  ): Promise<AdapterTextOutput<A, Output>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props);
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptText<Output>(compiledTemplate, options, metadata);
    return result as unknown as AdapterTextOutput<A, Output>;
  }
}

export class ObjectPrompt<
  Input extends JSONObject,
  Output extends JSONObject,
  A extends Adapter = Adapter
> {
  protected templateEngine: TemplateEngine;
  protected adapter: A;
  protected path: string | undefined;
  public template: any;
  constructor(template: any, templateEngine: TemplateEngine, adapter: A, path?: string | undefined) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
    this.path = path;
  }

  async format(
    props: Input,
    options: JSONObject = {}
  ): Promise<AdapterObjectOutput<A, Output>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props);
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptObject<Output>(compiledTemplate, options, metadata);
    return result as unknown as AdapterObjectOutput<A, Output>;
  }
}

export class ImagePrompt<
  Input extends JSONObject,
  Output extends string,
  A extends Adapter = Adapter
> {
  protected templateEngine: TemplateEngine;
  protected adapter: A;
  protected path: string | undefined;
  public template: any;
  constructor(template: any, templateEngine: TemplateEngine, adapter: A, path?: string | undefined) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
    this.path = path;
  }

  async format(
    props: Input,
    options: JSONObject = {}
  ): Promise<AdapterImageOutput<A, Output>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props);
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptImage<Output>(compiledTemplate, options, metadata);
    return result as unknown as AdapterImageOutput<A, Output>;
  }
}