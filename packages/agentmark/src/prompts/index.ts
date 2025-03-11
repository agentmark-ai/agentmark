import { Adapter, TemplateEngine, JSONObject, RuntimeConfig } from "../types";
import { TextConfig, ObjectConfig, ImageConfig } from "../types";

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

export class TextPrompt<
  InputType extends JSONObject = JSONObject,
  A extends Adapter = Adapter
> {
  protected templateEngine: TemplateEngine;
  protected adapter: A;
  public template: any;
  constructor(template: any, templateEngine: TemplateEngine, adapter: A) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
  }

  async format(props: InputType, runtimeConfig: RuntimeConfig = {}): Promise<ReturnType<A['adaptText']>> {
    const result = await this.templateEngine.format(this.template, props);
    const config = getConfigSettings(result, props, runtimeConfig);
    return this.adapter.adaptText(result, config) as ReturnType<A['adaptText']>;
  }
}

export class ObjectPrompt<
  InputType extends JSONObject = JSONObject,
  A extends Adapter = Adapter
> {
  protected templateEngine: TemplateEngine;
  protected adapter: A;
  public template: any;
  constructor(template: any, templateEngine: TemplateEngine, adapter: A) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
  }

  async format(props: InputType, runtimeConfig: RuntimeConfig = {}): Promise<ReturnType<A['adaptObject']>> {
    const result = await this.templateEngine.format(this.template, props);
    const config = getConfigSettings(result, props, runtimeConfig);
    return this.adapter.adaptObject(result, config) as ReturnType<A['adaptObject']>;
  }
}

export class ImagePrompt<
  InputType extends JSONObject = JSONObject,
  A extends Adapter = Adapter
> {
  protected templateEngine: TemplateEngine;
  protected adapter: A;
  public template: any;
  constructor(template: any, templateEngine: TemplateEngine, adapter: A) {
    this.template = template;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
  }

  async format(props: InputType, runtimeConfig: RuntimeConfig = {}): Promise<ReturnType<A['adaptImage']>> {
    const result = await this.templateEngine.format(this.template, props);
    const config = getConfigSettings(result, props, runtimeConfig);
    return this.adapter.adaptImage(result, config) as ReturnType<A['adaptImage']>;
  }
}
