import { Adapter, TemplateEngine, JSONObject, PromptMetadata, ChatMessage, AdapterTextOutput, AdapterObjectOutput, AdapterImageOutput, TextConfig, ObjectConfig, ImageConfig } from "../types";
import { jsonSchema } from 'ai';

/**
 * Common interface for all prompt types with a generic return type
 */
export interface Prompt<Input extends JSONObject, Output, A extends Adapter = Adapter> {
  /**
   * The original prompt template
   */
  template: unknown;
  
  /**
   * Format the prompt with the given input properties and options
   */
  format(props: Input, options?: JSONObject): Promise<unknown>;
}

/**
 * Text prompt specific interface
 */
export interface TextPromptInterface<Input extends JSONObject, Output extends string, A extends Adapter = Adapter> 
  extends Prompt<Input, Output, A> {
  format(props: Input, options?: JSONObject): Promise<AdapterTextOutput<A, Output>>;
}

/**
 * Object prompt specific interface
 */
export interface ObjectPromptInterface<Input extends JSONObject, Output extends JSONObject, A extends Adapter = Adapter> 
  extends Prompt<Input, Output, A> {
  format(props: Input, options?: JSONObject): Promise<AdapterObjectOutput<A, Output>>;
}

/**
 * Image prompt specific interface
 */
export interface ImagePromptInterface<Input extends JSONObject, Output extends string, A extends Adapter = Adapter> 
  extends Prompt<Input, Output, A> {
  format(props: Input, options?: JSONObject): Promise<AdapterImageOutput<A, Output>>;
}

/**
 * Prompt implementation for text-based prompts
 */
export class TextPrompt<
  Input extends JSONObject,
  T extends string,
  A extends Adapter = Adapter
> implements TextPromptInterface<Input, T, A> {
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
  ): Promise<AdapterTextOutput<A, T>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as TextConfig;
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptText<T>(compiledTemplate, options, metadata);
    return result as AdapterTextOutput<A, T>;
  }
}

/**
 * Prompt implementation for object-based prompts
 */
export class ObjectPrompt<
  Input extends JSONObject,
  T extends JSONObject,
  A extends Adapter = Adapter
> implements ObjectPromptInterface<Input, T, A> {
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
  ): Promise<AdapterObjectOutput<A, T>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as ObjectConfig;
    
    // Add the schema directly to the compiledTemplate with the correct Output type
    const typedSchema = jsonSchema<T>(compiledTemplate.metadata.model.settings.schema);
    
    // Create an enhanced template with the typed schema
    const enhancedTemplate = {
      ...compiledTemplate,
      jsonSchema: typedSchema
    };
    
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptObject<T>(enhancedTemplate, options, metadata);
    return result as AdapterObjectOutput<A, T>;
  }
}

/**
 * Prompt implementation for image-based prompts
 */
export class ImagePrompt<
  Input extends JSONObject,
  T extends string,
  A extends Adapter = Adapter
> implements ImagePromptInterface<Input, T, A> {
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
  ): Promise<AdapterImageOutput<A, T>> {
    const compiledTemplate = await this.templateEngine.compile(this.template, props) as ImageConfig;
    const metadata: PromptMetadata = { props, path: this.path, template: this.template };
    const result = this.adapter.adaptImage<T>(compiledTemplate, options, metadata);
    return result as AdapterImageOutput<A, T>;
  }
}