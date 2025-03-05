import { Adapter, TemplateEngine, JSONObject } from "../types";
import { TextConfig, ObjectConfig, ImageConfig, RuntimeConfig } from "../types";

const getConfigSettings = (
  input: TextConfig | ObjectConfig | ImageConfig,
  props: Record<string, any>,
  runtimeConfig: RuntimeConfig
): RuntimeConfig => {
  const telemetry = runtimeConfig.telemetry;
  if (telemetry) {
    return {
      ...runtimeConfig,
      telemetry: {
        ...telemetry,
        metadata: {
          ...telemetry.metadata,
          prompt: input.name,
          props: JSON.stringify(props),
        }
      }
    }
  }
  return runtimeConfig;
}

export class TextPrompt<InputType extends JSONObject = JSONObject> {
  protected templateEngine: TemplateEngine;
  protected adapter: Adapter;
  protected template: any;
  constructor(template: any, templateEngine: TemplateEngine, adapter: Adapter) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
  }

  async compile(props: InputType, runtimeConfig: RuntimeConfig = {}) {
    const result = await this.templateEngine.compile(this.template, props);
    const config = getConfigSettings(result, props, runtimeConfig);
    return this.adapter.adaptText(result, config);
  }
}

export class ObjectPrompt<InputType extends JSONObject = JSONObject> {
  protected templateEngine: TemplateEngine;
  protected adapter: Adapter;
  protected template: any;
  constructor(template: any, templateEngine: TemplateEngine, adapter: Adapter) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
  }

  async compile(props: InputType, runtimeConfig: RuntimeConfig = {}) {
    const result = await this.templateEngine.compile(this.template, props);
    const config = getConfigSettings(result, props, runtimeConfig);
    return this.adapter.adaptObject(result, config);
  }
}

export class ImagePrompt<InputType extends JSONObject = JSONObject> {
  protected templateEngine: TemplateEngine;
  protected adapter: Adapter;
  protected template: any;
  constructor(template: any, templateEngine: TemplateEngine, adapter: Adapter) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
  }

  async compile(props: InputType, runtimeConfig: RuntimeConfig = {}) {
    const result = await this.templateEngine.compile(this.template, props);
    const config = getConfigSettings(result, props, runtimeConfig);
    return this.adapter.adaptImage(result, config);
  }
}
