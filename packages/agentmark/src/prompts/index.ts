import { Adapter, TemplateEngine, JSONObject, PromptMetadata } from "../types";

export class TextPrompt<
  PromptType extends { input: JSONObject, output: any },
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
    props: PromptType['input'], 
    options: A extends Adapter<any, any, any, infer O> ? O : {} = {} as any
  ): Promise<ReturnType<A['adaptText']>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props);
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptText(compiledTemplate, options, metadata) as ReturnType<A['adaptText']>;
  }
}

export class ObjectPrompt<
  PromptType extends { input: JSONObject, output: any },
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
    props: PromptType['input'], 
    options: A extends Adapter<any, any, any, infer O> ? O : {} = {} as any
  ): Promise<ReturnType<A['adaptObject']>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props);
    const settings: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptObject(compiledTemplate, options, settings) as ReturnType<A['adaptObject']>;
  }
}

export class ImagePrompt<
  PromptType extends { input: JSONObject, output: any },
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
    props: PromptType['input'],
    options: A extends Adapter<any, any, any, infer O> ? O : {} = {} as any
  ): Promise<ReturnType<A['adaptImage']>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props);
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptImage(compiledTemplate, options, metadata) as ReturnType<A['adaptImage']>;
  }
}
