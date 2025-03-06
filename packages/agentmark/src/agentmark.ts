import { Loader, TemplateEngine, Adapter } from "./types";
import { TextPrompt, ObjectPrompt, ImagePrompt } from "./prompts";
import { TextConfigSchema, ObjectConfigSchema, ImageConfigSchema } from "./schemas";
import { TemplatedxTemplateEngine } from "./template_engines/templatedx";
import { DefaultAdapter } from "./adapters/default";
import type { PromptType, JSONObject } from "./types";

type AgentMarkOptions = {
  adapter: Adapter;
  loader: Loader;
  templateEngine: TemplateEngine;
}

type Loadable = string | JSONObject;

export class AgentMark<T extends Record<string, PromptType> = Record<string, PromptType>> {
  protected loader: Loader;
  protected adapter: Adapter;
  protected templateEngine: TemplateEngine;
  constructor({
    loader,
    adapter = new DefaultAdapter(),
    templateEngine = new TemplatedxTemplateEngine(),
  }: AgentMarkOptions) {
    this.loader = loader;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
  }

  async loadTextPrompt<K extends keyof T & Loadable>(pathOrPreloaded: K) {
    if (typeof pathOrPreloaded === 'string') {
      const template = await this.loader.load(pathOrPreloaded);
      TextConfigSchema.parse(await this.templateEngine.compile(template));
      return new TextPrompt<T[K]['input']>(template, this.templateEngine, this.adapter);
    }
    return new TextPrompt<T[K]['input']>(pathOrPreloaded, this.templateEngine, this.adapter);
  }

  async loadObjectPrompt<K extends keyof T & Loadable>(pathOrPreloaded: K) {
    if (typeof pathOrPreloaded === 'string') {
      const content = await this.loader.load(pathOrPreloaded);
      ObjectConfigSchema.parse(await this.templateEngine.compile(content));
      return new ObjectPrompt<T[K]['input']>(content, this.templateEngine, this.adapter);
    }
    return new ObjectPrompt<T[K]['input']>(pathOrPreloaded, this.templateEngine, this.adapter);
  }

  async loadImagePrompt<K extends keyof T & Loadable>(pathOrPreloaded: K) {
    if (typeof pathOrPreloaded === 'string') {
      const content = await this.loader.load(pathOrPreloaded);
      ImageConfigSchema.parse(await this.templateEngine.compile(content));
      return new ImagePrompt<T[K]['input']>(content, this.templateEngine, this.adapter);
    }
    return new ImagePrompt<T[K]['input']>(pathOrPreloaded, this.templateEngine, this.adapter);
  }
}