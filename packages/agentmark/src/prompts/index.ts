import { Adapter, TemplateEngine, JSONObject, PromptMetadata } from "../types";

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
  ) {
    const compiledTemplate = await this.templateEngine.compile(this.template, props);
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptText(compiledTemplate, options, metadata);
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
  ) {
    const compiledTemplate = await this.templateEngine.compile(this.template, props);
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptObject(compiledTemplate, options, metadata);
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
  ) {
    const compiledTemplate = await this.templateEngine.compile(this.template, props);
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptImage(compiledTemplate, options, metadata);
  }
}