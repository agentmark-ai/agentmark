import { Adapter, TemplateEngine, JSONObject, PromptMetadata, ObjectConfig } from "../types";
import { jsonSchema } from 'ai';

export class ObjectPrompt<
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
  ): Promise<ReturnType<A['adaptObject']>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as ObjectConfig;
    const typedSchema = jsonSchema<T[K]["output"]>(compiledTemplate.metadata.model.settings.schema);
    const enhancedTemplate = {
      ...compiledTemplate,
      typedSchema,
    };
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    return this.adapter.adaptObject<K>(enhancedTemplate, options, metadata);
  }
} 