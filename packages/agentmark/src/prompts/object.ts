import { Adapter, TemplateEngine, JSONObject, PromptMetadata, AdapterObjectOutput, ObjectConfig } from "../types";
import { jsonSchema } from 'ai';
import { Prompt } from "./index";

export interface ObjectPromptInterface<Input extends JSONObject, Output extends JSONObject, A extends Adapter = Adapter> 
  extends Prompt<Input, Output, A> {
  format(props: Input, options?: JSONObject): Promise<AdapterObjectOutput<A, Output>>;
}

export class ObjectPrompt<
  Input extends JSONObject,
  Output extends JSONObject,
  A extends Adapter = Adapter
> implements ObjectPromptInterface<Input, Output, A> {
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
  ): Promise<AdapterObjectOutput<A, Output>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as ObjectConfig;
    const typedSchema = jsonSchema<Output>(compiledTemplate.metadata.model.settings.schema);
    const enhancedTemplate = {
      ...compiledTemplate,
      typedSchema,
    };
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptObject<Output>(enhancedTemplate, options, metadata);
    return result as AdapterObjectOutput<A, Output>;
  }
} 