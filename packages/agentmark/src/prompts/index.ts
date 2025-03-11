import { Adapter, TemplateEngine, JSONObject, RuntimeConfig, PromptMetadata } from "../types";

export class TextPrompt<
  InputType extends JSONObject = JSONObject,
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

  async format(props: InputType, runtimeConfig: RuntimeConfig = {}): Promise<ReturnType<A['adaptText']>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props);
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptText(compiledTemplate, runtimeConfig, metadata) as ReturnType<A['adaptText']>;
  }
}

export class ObjectPrompt<
  InputType extends JSONObject = JSONObject,
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

  async format(props: InputType, runtimeConfig: RuntimeConfig = {}): Promise<ReturnType<A['adaptObject']>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props);
    const settings: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptObject(compiledTemplate, runtimeConfig, settings) as ReturnType<A['adaptObject']>;
  }
}

export class ImagePrompt<
  InputType extends JSONObject = JSONObject,
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

  async format(props: InputType, runtimeConfig: RuntimeConfig = {}): Promise<ReturnType<A['adaptImage']>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props);
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptImage(compiledTemplate, runtimeConfig, metadata) as ReturnType<A['adaptImage']>;
  }
}
