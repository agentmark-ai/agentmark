import { Loader, TemplateEngine, Adapter, AgentMarkFileTypes } from "./types";
import { ObjectPrompt } from "./prompts/object";
import { ObjectConfigSchema } from "./schemas";
import { TemplatedxTemplateEngine } from "./template_engines/templatedx";

export type AgentMarkOptions<
  T extends { [K in keyof T]: { input: any; output: any } },
  A extends Adapter<T>,
> = {
  loader: Loader<T>;
  adapter: A;
  templateEngine?: TemplateEngine;
}

export class AgentMark<
  T extends { [K in keyof T]: { input: any; output: any } },
  A extends Adapter<T>,
> {
  protected loader: Loader<T>;
  protected adapter: A;
  protected templateEngine: TemplateEngine;
  
  constructor({
    loader,
    adapter,
    templateEngine = new TemplatedxTemplateEngine(),
  }: {
    loader: Loader<T>;
    adapter: A;
    templateEngine?: TemplateEngine;
  }) {
    this.loader = loader;
    this.templateEngine = templateEngine;
    this.adapter = adapter;
  }

  // async loadTextPrompt<K extends keyof T & string>(
  //   pathOrPreloaded: K, 
  //   options?: Parameters<L['load']>[1]
  // ): Promise<TextPrompt<T, K, A>> {
  //   let content: unknown;
    
  //   if (typeof pathOrPreloaded === 'string') {
  //     content = await this.loader.load(pathOrPreloaded, options);
  //   } else {
  //     content = pathOrPreloaded;
  //   }
    
  //   TextConfigSchema.parse(await this.templateEngine.compile(content));
  //   return new TextPrompt<T, K, A>(content, this.templateEngine, this.adapter, pathOrPreloaded);
  // }

  async loadObjectPrompt<K extends keyof T & string>(
    pathOrPreloaded: K,
    options?: any
  ): Promise<ObjectPrompt<T, A, K>> {
    let content: unknown;
    
    if (typeof pathOrPreloaded === 'string') {
      content = await this.loader.load(pathOrPreloaded, options);
    } else {
      content = pathOrPreloaded;
    }
    
    ObjectConfigSchema.parse(await this.templateEngine.compile(content));
    return new ObjectPrompt<T, A, K>(
      content,
      this.templateEngine,
      this.adapter,
      pathOrPreloaded
    );
  }

  // async loadImagePrompt<K extends keyof T & string>(
  //   pathOrPreloaded: K, 
  //   options?: Parameters<L['load']>[1]
  // ): Promise<ImagePrompt<T, K, A>> {
  //   let content: unknown;
    
  //   if (typeof pathOrPreloaded === 'string') {
  //     content = await this.loader.load(pathOrPreloaded, options);
  //   } else {
  //     content = pathOrPreloaded;
  //   }
    
  //   ImageConfigSchema.parse(await this.templateEngine.compile(content));
  //   return new ImagePrompt<T, K, A>(content, this.templateEngine, this.adapter, pathOrPreloaded);
  // }
}