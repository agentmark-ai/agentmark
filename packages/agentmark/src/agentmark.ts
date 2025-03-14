import { Loader, TemplateEngine, Adapter } from "./types";
import { TextPrompt, ObjectPrompt, ImagePrompt } from "./prompts";
import { TextConfigSchema, ObjectConfigSchema, ImageConfigSchema } from "./schemas";
import { TemplatedxTemplateEngine } from "./template_engines/templatedx";
import { DefaultAdapter } from "./adapters/default";

type AgentMarkOptions = {
  loader: Loader;
  adapter?: Adapter;
  templateEngine?: TemplateEngine;
}

export class AgentMark<
  T extends { [K in keyof T]: { input: any; output: any } },
  A extends Adapter = Adapter
> {
  protected loader: Loader;
  protected adapter: A;
  protected templateEngine: TemplateEngine;
  
  constructor({
    loader,
    adapter = new DefaultAdapter() as any as A,
    templateEngine = new TemplatedxTemplateEngine(),
  }: AgentMarkOptions) {
    this.loader = loader;
    this.templateEngine = templateEngine;
    this.adapter = adapter as A;
  }

  async loadTextPrompt<K extends keyof T & string>(pathOrPreloaded: K): Promise<TextPrompt<T[K]["input"], A>> {
    let content = pathOrPreloaded;
    if (typeof pathOrPreloaded === 'string') {
      content = await this.loader.load(pathOrPreloaded);
    }
    TextConfigSchema.parse(await this.templateEngine.compile(content));
    return new TextPrompt<T[K], A>(content, this.templateEngine, this.adapter);
  }

  async loadObjectPrompt<K extends keyof T & string>(pathOrPreloaded: K): Promise<ObjectPrompt<T[K]["input"], A>> {
    let content = pathOrPreloaded;
    if (typeof pathOrPreloaded === 'string') {
      content = await this.loader.load(pathOrPreloaded);
    }
    ObjectConfigSchema.parse(await this.templateEngine.compile(content));
    return new ObjectPrompt<T[K], A>(content, this.templateEngine, this.adapter);
  }

  async loadImagePrompt<K extends keyof T & string>(pathOrPreloaded: K): Promise<ImagePrompt<T[K]["input"], A>> {
    let content = pathOrPreloaded;
    if (typeof pathOrPreloaded === 'string') {
      content = await this.loader.load(pathOrPreloaded);
    }
    ImageConfigSchema.parse(await this.templateEngine.compile(content));
    return new ImagePrompt<T[K], A>(content, this.templateEngine, this.adapter);
  }
}