import { Loader, TemplateEngine, Adapter } from "./types";
import { TextPrompt, ImagePrompt, Prompt, TextPromptInterface, ImagePromptInterface } from "./prompts";
import { ObjectPrompt, ObjectPromptInterface } from "./prompts/object";
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

  /**
   * Generic method to load any type of prompt
   */
  async loadPrompt<K extends keyof T & string>(
    type: 'text',
    pathOrPreloaded: K
  ): Promise<TextPromptInterface<T[K]["input"], T[K]["output"], A>>;
  
  async loadPrompt<K extends keyof T & string>(
    type: 'object',
    pathOrPreloaded: K
  ): Promise<ObjectPromptInterface<T[K]["input"], T[K]["output"], A>>;
  
  async loadPrompt<K extends keyof T & string>(
    type: 'image',
    pathOrPreloaded: K
  ): Promise<ImagePromptInterface<T[K]["input"], T[K]["output"], A>>;
  
  async loadPrompt<K extends keyof T & string>(
    type: 'text' | 'object' | 'image',
    pathOrPreloaded: K
  ): Promise<Prompt<T[K]["input"], T[K]["output"], A>> {
    switch (type) {
      case 'text':
        return this.loadTextPrompt(pathOrPreloaded);
      case 'object':
        return this.loadObjectPrompt(pathOrPreloaded);
      case 'image':
        return this.loadImagePrompt(pathOrPreloaded);
      default:
        throw new Error(`Unknown prompt type: ${type}`);
    }
  }
}