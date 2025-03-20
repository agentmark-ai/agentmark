import { Loader, TemplateEngine, Adapter, JSONObject } from "./types";
import { Prompt } from "./prompts";
import { TextPrompt, TextPromptInterface } from "./prompts/text";
import { ObjectPrompt, ObjectPromptInterface } from "./prompts/object";
import { ImagePrompt, ImagePromptInterface } from "./prompts/image";
import { TextConfigSchema, ObjectConfigSchema, ImageConfigSchema } from "./schemas";
import { TemplatedxTemplateEngine } from "./template_engines/templatedx";

type AgentMarkOptions<A extends Adapter = Adapter> = {
  loader: Loader;
  adapter: A;
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
    adapter,
    templateEngine = new TemplatedxTemplateEngine(),
  }: AgentMarkOptions<A>) {
    this.loader = loader;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
  }

  async loadTextPrompt<K extends keyof T & string>(pathOrPreloaded: K): Promise<TextPrompt<T, K, A>> {
    let content: unknown;
    
    if (typeof pathOrPreloaded === 'string') {
      content = await this.loader.load(pathOrPreloaded);
    } else {
      content = pathOrPreloaded;
    }
    
    TextConfigSchema.parse(await this.templateEngine.compile(content));
    return new TextPrompt<T, K, A>(content, this.templateEngine, this.adapter, pathOrPreloaded);
  }

  async loadObjectPrompt<K extends keyof T & string>(pathOrPreloaded: K): Promise<ObjectPrompt<T, K, A>> {
    let content: unknown;
    
    if (typeof pathOrPreloaded === 'string') {
      content = await this.loader.load(pathOrPreloaded);
    } else {
      content = pathOrPreloaded;
    }
    
    ObjectConfigSchema.parse(await this.templateEngine.compile(content));
    return new ObjectPrompt<T, K, A>(
      content,
      this.templateEngine,
      this.adapter,
      pathOrPreloaded
    );
  }

  async loadImagePrompt<K extends keyof T & string>(pathOrPreloaded: K): Promise<ImagePrompt<T, K, A>> {
    let content: unknown;
    
    if (typeof pathOrPreloaded === 'string') {
      content = await this.loader.load(pathOrPreloaded);
    } else {
      content = pathOrPreloaded;
    }
    
    ImageConfigSchema.parse(await this.templateEngine.compile(content));
    return new ImagePrompt<T, K, A>(content, this.templateEngine, this.adapter, pathOrPreloaded);
  }
}