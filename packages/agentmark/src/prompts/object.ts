import { Adapter, TemplateEngine, JSONObject, PromptMetadata, AdapterObjectOutput, ObjectConfig } from "../types";
import { jsonSchema } from 'ai';

/**
 * Object prompt specific interface
 */
export interface ObjectPromptInterface<Input extends JSONObject, Output extends JSONObject, A extends Adapter = Adapter> {
  /**
   * The original prompt template
   */
  template: unknown;
  
  /**
   * Format the prompt with the given input properties and options
   */
  format(props: Input, options?: JSONObject): Promise<AdapterObjectOutput<A, Output>>;
}

/**
 * Prompt implementation for object-based prompts
 */
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

  /**
   * Format the prompt with input props and return typed adapter output
   * This preserves the Output type throughout the chain
   */
  async format(
    props: Input,
    options: JSONObject = {}
  ): Promise<AdapterObjectOutput<A, Output>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as ObjectConfig;
    
    // Create a schema using the Output type parameter
    const typedSchema = jsonSchema<Output>(compiledTemplate.metadata.model.settings.schema);
    
    // Add the schema to the template
    const enhancedTemplate = {
      ...compiledTemplate,
      jsonSchema: typedSchema
    };
    
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    
    // Pass the Output type parameter to adaptObject
    const result = this.adapter.adaptObject<Output>(enhancedTemplate, options, metadata);
    
    // Return the properly typed result
    return result as AdapterObjectOutput<A, Output>;
  }
} 