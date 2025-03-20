import { Adapter, TemplateEngine, JSONObject, PromptMetadata, AdapterObjectOutput, ObjectConfig } from "../types";
import { jsonSchema } from 'ai';
import { Prompt } from "./index";

export interface ObjectPromptInterface<
  T extends Record<string, { input: any; output: any }>,
  K extends keyof T & string,
  A extends Adapter = Adapter
> extends Prompt<T[K]["input"], T[K]["output"], A> {
  path: K;
  format(props: T[K]["input"], options?: JSONObject): Promise<AdapterObjectOutput<A, T[K]["output"]>>;
}

export class ObjectPrompt<
  T extends Record<string, { input: any; output: any }>,
  K extends keyof T & string,
  A extends Adapter = Adapter
> implements ObjectPromptInterface<T, K, A> {
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
  ): Promise<AdapterObjectOutput<A, T[K]["output"]>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as ObjectConfig;
    const typedSchema = jsonSchema<T[K]["output"]>(compiledTemplate.metadata.model.settings.schema);
    const enhancedTemplate = {
      ...compiledTemplate,
      typedSchema,
    };
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptObject<T[K]["output"]>(enhancedTemplate, options, metadata);
  }
} 