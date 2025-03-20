import { Adapter, TemplateEngine, JSONObject, PromptMetadata, AdapterImageOutput, ImageConfig } from "../types";
import { Prompt } from "./index";

export interface ImagePromptInterface<
  T extends Record<string, { input: any; output: any }>,
  K extends keyof T & string,
  A extends Adapter = Adapter
> extends Prompt<T[K]["input"], T[K]["output"], A> {
  path: K;
  format(props: T[K]["input"], options?: JSONObject): Promise<AdapterImageOutput<A, T[K]["output"]>>;
}

export class ImagePrompt<
  T extends Record<string, { input: any; output: any }>,
  K extends keyof T & string,
  A extends Adapter = Adapter
> implements ImagePromptInterface<T, K, A> {
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
  ): Promise<AdapterImageOutput<A, T[K]["output"]>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as ImageConfig;
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptImage<T[K]["output"]>(compiledTemplate, options, metadata);
  }
} 