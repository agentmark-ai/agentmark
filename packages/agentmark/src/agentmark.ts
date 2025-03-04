import { Loader, TemplateEngine, Adapter } from "./types";
import { TextPrompt, ObjectPrompt, ImagePrompt } from "./prompts";
import { TemplatedxTemplateEngine } from "./template_engines/templatedx";
import { DefaultAdapter } from "./adapters/default";
import type { PromptType } from "./types";

type AgentMarkOptions = {
  adapter: Adapter;
  loader: Loader;
  templateEngine: TemplateEngine;
}

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

  async loadTextPrompt<K extends keyof T & string>(path: K) {
    const template = await this.loader.load(path);
    return new TextPrompt<T[K]['input']>(template, this.templateEngine, this.adapter);
  }

  async loadObjectPrompt<K extends keyof T & string>(path: K) {
    const content = await this.loader.load(path);
    return new ObjectPrompt<T[K]['input']>(content, this.templateEngine, this.adapter);
  }

  async loadImagePrompt<K extends keyof T & string>(path: K) {
    const content = await this.loader.load(path);
    return new ImagePrompt<T[K]['input']>(content, this.templateEngine, this.adapter);
  }
}