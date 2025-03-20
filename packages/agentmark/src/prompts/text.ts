import { Adapter, TemplateEngine, JSONObject, PromptMetadata, AdapterTextOutput, TextConfig } from "../types";
import { Prompt } from "./index";

export interface TextPromptInterface<Props extends JSONObject, Result extends string, A extends Adapter = Adapter> 
  extends Prompt<Props, Result, A> {
  format(props: Props, options?: JSONObject): Promise<AdapterTextOutput<A, Result>>;
}

export class TextPrompt<
  Props extends JSONObject,
  Result extends string,
  A extends Adapter = Adapter
> implements TextPromptInterface<Props, Result, A> {
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
    props: Props, 
    options: JSONObject = {}
  ): Promise<AdapterTextOutput<A, Result>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as TextConfig;
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptText<Result>(compiledTemplate, options, metadata);
    return result as AdapterTextOutput<A, Result>;
  }
} 