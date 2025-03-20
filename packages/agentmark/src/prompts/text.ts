import { Adapter, TemplateEngine, JSONObject, PromptMetadata, AdapterTextOutput, TextConfig } from "../types";
import { Prompt } from "./index";

export interface TextPromptInterface<Input extends JSONObject, Output extends string, A extends Adapter = Adapter> 
  extends Prompt<Input, Output, A> {
  format(props: Input, options?: JSONObject): Promise<AdapterTextOutput<A, Output>>;
}

export class TextPrompt<
  Input extends JSONObject,
  Output extends string,
  A extends Adapter = Adapter
> implements TextPromptInterface<Input, Output, A> {
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
  ): Promise<AdapterTextOutput<A, Output>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as TextConfig;
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptText<Output>(compiledTemplate, options, metadata);
    return result as AdapterTextOutput<A, Output>;
  }
} 