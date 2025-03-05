import { Adapter, TemplateEngine, JSONObject } from "../types";
import { TextConfigSchema, ObjectConfigSchema, ImageConfigSchema } from "../schemas";
import { TextConfig, ObjectConfig, ImageConfig } from "../types";

const getTelemetrySettings = (input: TextConfig | ObjectConfig | ImageConfig, props: Record<string, any>): Record<string, any> => {
  return {
    telemetry: {
      prompt: input.metadata.model.name,
      props: JSON.stringify(props),
    }
  }
}

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
    const config = { ...getTelemetrySettings(parsed, props), ...runtimeConfig };
    return this.adapter.adaptText(parsed, config);
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
    const config = { ...getTelemetrySettings(parsed, props), ...runtimeConfig };
    return this.adapter.adaptObject(parsed, config);
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
    const config = { telemetry: getTelemetrySettings(parsed, props), ...runtimeConfig };
    return this.adapter.adaptImage(parsed, config);
  }
}
