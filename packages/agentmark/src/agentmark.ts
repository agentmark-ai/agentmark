import { Loader, TemplateEngine, Adapter } from "./types";
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

  async loadTextPrompt<K extends keyof T & string>(pathOrPreloaded: K): Promise<TextPrompt<T[K]["input"], T[K]["output"], A>> {
    let content: unknown;
    
    if (typeof pathOrPreloaded === 'string') {
      content = await this.loader.load(pathOrPreloaded);
    } else {
      content = pathOrPreloaded;
    }
    
    TextConfigSchema.parse(await this.templateEngine.compile(content));
    return new TextPrompt<T[K]["input"], T[K]["output"], A>(content, this.templateEngine, this.adapter, pathOrPreloaded);
  }

  async loadObjectPrompt<K extends keyof T & string>(
    pathOrPreloaded: K
  ): Promise<ObjectPrompt<T[K]["input"], T[K]["output"], A>>;
  
  async loadObjectPrompt<Input extends Record<string, any>, Output extends Record<string, any>>(
    pathOrPreloaded: string
  ): Promise<ObjectPrompt<Input, Output, A>>;
  
  async loadObjectPrompt<K extends keyof T & string, Input extends Record<string, any> = T[K]["input"], Output extends Record<string, any> = T[K]["output"]>(
    pathOrPreloaded: K | string
  ): Promise<ObjectPrompt<Input, Output, A>> {
    let content: unknown;
    
    if (typeof pathOrPreloaded === 'string') {
      content = await this.loader.load(pathOrPreloaded);
    } else {
      content = pathOrPreloaded;
    }
    
    ObjectConfigSchema.parse(await this.templateEngine.compile(content));
    
    // Create and return a properly typed ObjectPrompt
    return new ObjectPrompt<Input, Output, A>(
      content,
      this.templateEngine,
      this.adapter,
      typeof pathOrPreloaded === 'string' ? pathOrPreloaded : undefined
    );
  }

  async loadImagePrompt<K extends keyof T & string>(pathOrPreloaded: K): Promise<ImagePrompt<T[K]["input"], T[K]["output"], A>> {
    let content: unknown;
    
    if (typeof pathOrPreloaded === 'string') {
      content = await this.loader.load(pathOrPreloaded);
    } else {
      content = pathOrPreloaded;
    }
    
    ImageConfigSchema.parse(await this.templateEngine.compile(content));
    return new ImagePrompt<T[K]["input"], T[K]["output"], A>(content, this.templateEngine, this.adapter, pathOrPreloaded);
  }
}