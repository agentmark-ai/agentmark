import { Adapter, TemplateEngine, JSONObject, PromptMetadata, ImageConfig } from "../types";

export class ImagePrompt<
  T extends { [K in keyof T]: { input: any; output: any } },
  A extends Adapter<T>,
  K extends keyof T & string
> {
  protected templateEngine: TemplateEngine;
  protected adapter: A;
  public path: K;
  public template: unknown;
  
  constructor(template: unknown, templateEngine: TemplateEngine, adapter: A, path: K) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
    this.path = path;
  }

  async format(
    props: T[K]["input"],
    options: JSONObject = {}
  ): Promise<ReturnType<A['adaptImage']>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as ImageConfig;
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptImage(compiledTemplate, options, metadata);
  }
} 