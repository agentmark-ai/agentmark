import { Adapter, TemplateEngine, JSONObject } from "../types";
import { TextConfigSchema, ObjectConfigSchema, ImageConfigSchema } from "../schemas";

export class TextPrompt<InputType extends JSONObject = JSONObject> {
  protected templateEngine: TemplateEngine;
  protected adapter: Adapter;
  protected template: string;
  constructor(template: string, templateEngine: TemplateEngine, adapter: Adapter) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
  }

  async compile(props: InputType, runtimeConfig?: Record<string, any>) {
    const result = await this.templateEngine.compile(this.template, props);
    const parsed = TextConfigSchema.parse(result);
    return this.adapter.adaptText(parsed, runtimeConfig);
  }
}

export class ObjectPrompt<InputType extends JSONObject = JSONObject> {
  protected templateEngine: TemplateEngine;
  protected adapter: Adapter;
  protected template: string;
  constructor(template: string, templateEngine: TemplateEngine, adapter: Adapter) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
  }

  async compile(props: InputType, runtimeConfig?: Record<string, any>) {
    const result = await this.templateEngine.compile(this.template, props);
    const parsed = ObjectConfigSchema.parse(result);
    return this.adapter.adaptObject(parsed, runtimeConfig);
  }
}

export class ImagePrompt<InputType extends JSONObject = JSONObject> {
  protected templateEngine: TemplateEngine;
  protected adapter: Adapter;
  protected template: string;
  constructor(template: string, templateEngine: TemplateEngine, adapter: Adapter) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
  }

  async compile(props: InputType, runtimeConfig?: Record<string, any>) {
    const result = await this.templateEngine.compile(this.template, props);
    const parsed = ImageConfigSchema.parse(result);
    return this.adapter.adaptImage(parsed, runtimeConfig);
  }
}
