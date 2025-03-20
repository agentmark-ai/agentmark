import { Adapter, TemplateEngine, JSONObject, PromptMetadata, AdapterTextOutput, TextConfig } from "../types";
import { Prompt } from "./index";

export interface TextPromptInterface<
  T extends Record<string, { input: any; output: any }>,
  K extends keyof T & string,
  A extends Adapter = Adapter
> extends Prompt<T[K]["input"], T[K]["output"], A> {
  path: K;
  format(props: T[K]["input"], options?: JSONObject): Promise<AdapterTextOutput<A, T[K]["output"]>>;
}

export class TextPrompt<
  T extends Record<string, { input: any; output: any }>,
  K extends keyof T & string,
  A extends Adapter = Adapter
> implements TextPromptInterface<T, K, A> {
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
  ): Promise<AdapterTextOutput<A, T[K]["output"]>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as TextConfig;
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptText<T[K]["output"]>(compiledTemplate, options, metadata);
  }
} 