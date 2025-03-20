import { Adapter, TemplateEngine, JSONObject, PromptMetadata, ChatMessage, AdapterTextOutput, AdapterObjectOutput, AdapterImageOutput, TextConfig, ObjectConfig, ImageConfig } from "../types";
import { jsonSchema } from 'ai';

/**
 * A type that determines the correct adapter output type based on the output type
 */
export type PromptOutputType<Output, A extends Adapter> = 
  Output extends string ? AdapterTextOutput<A, Output> :
  Output extends JSONObject ? AdapterObjectOutput<A, Output> :
  Output extends unknown ? AdapterImageOutput<A, Output> :
  never;

/**
 * Common interface for all prompt types.
 * This provides a consistent API for working with different prompt types.
 */
export interface Prompt<Input extends JSONObject, Output, A extends Adapter = Adapter> {
  /**
   * The original prompt template
   */
  template: unknown;
  
  /**
   * Format the prompt with the given input properties and options
   */
  format(props: Input, options?: JSONObject): Promise<PromptOutputType<Output, A>>;
}

/**
 * Prompt implementation for text-based prompts
 */
export class TextPrompt<
  Input extends JSONObject,
  T extends string,
  A extends Adapter = Adapter
> implements Prompt<Input, T, A> {
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
  ): Promise<PromptOutputType<T, A>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as TextConfig;
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptText<T>(compiledTemplate, options, metadata);
    return result as PromptOutputType<T, A>;
  }
}

/**
 * Prompt implementation for object-based prompts
 */
export class ObjectPrompt<
  Input extends JSONObject,
  T extends JSONObject,
  A extends Adapter = Adapter
> implements Prompt<Input, T, A> {
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
  ): Promise<PromptOutputType<T, A>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as ObjectConfig;
    
    // Add the schema directly to the compiledTemplate
    const typedSchema = jsonSchema<T>(compiledTemplate.metadata.model.settings.schema);
    
    // Create an enhanced template with the typed schema
    const enhancedTemplate = {
      ...compiledTemplate,
      jsonSchema: typedSchema
    };
    
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptObject<T>(enhancedTemplate, options, metadata);
    return result as PromptOutputType<T, A>;
  }
}

/**
 * Prompt implementation for image-based prompts
 */
export class ImagePrompt<
  Input extends JSONObject,
  T extends string,
  A extends Adapter = Adapter
> implements Prompt<Input, T, A> {
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
  ): Promise<PromptOutputType<T, A>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as ImageConfig;
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptImage<T>(compiledTemplate, options, metadata);
    return result as PromptOutputType<T, A>;
  }
}