import { Loader, TemplateEngine, Adapter, PromptShape } from "./types";
import { ImageConfigSchema, ObjectConfigSchema, TextConfigSchema } from "./schemas";
import { TemplateDXTemplateEngine } from "./template_engines/templatedx";
import { ObjectPrompt, ImagePrompt, TextPrompt } from "./prompts";

export interface AgentMarkOptions<
  T extends { [K in keyof T]: { input: any; output: any } },
  A extends Adapter<T>
> {
  loader?: Loader<T>;
  adapter: A;
  templateEngine?: TemplateEngine;
}

export class AgentMark<
  T extends PromptShape<T>,
  A extends Adapter<T>
> {
  protected loader?: Loader<T>
  protected adapter: A;
  protected templateEngine: TemplateEngine;

  constructor({ loader, adapter, templateEngine }: AgentMarkOptions<T, A>) {
    this.loader = loader;
    this.adapter = adapter;
    this.templateEngine = templateEngine ?? new TemplateDXTemplateEngine();
  }

  async loadTextPrompt<K extends keyof T & string>(
    pathOrPreloaded: K,
    options?: any
  ): Promise<TextPrompt<T, A, K>> {
    let content: unknown;
    
    if (typeof pathOrPreloaded === 'string' && this.loader) {
      content = await this.loader.load(pathOrPreloaded, options);
    } else {
      content = pathOrPreloaded;
    }
    
    TextConfigSchema.parse(await this.templateEngine.compile(content));
    return new TextPrompt<T, A, K>(
      content, this.templateEngine, this.adapter, pathOrPreloaded,
    );
  }

  async loadObjectPrompt<K extends keyof T & string>(
    pathOrPreloaded: K,
    options?: any
  ): Promise<ObjectPrompt<T, A, K>> {
    let content: unknown;
    
    if (typeof pathOrPreloaded === 'string' && this.loader) {
      content = await this.loader.load(pathOrPreloaded, options);
    } else {
      content = pathOrPreloaded;
    }
    
    ObjectConfigSchema.parse(await this.templateEngine.compile(content));
    return new ObjectPrompt<T, A, K>(
      content, this.templateEngine, this.adapter, pathOrPreloaded,
    );
  }

  async loadImagePrompt<K extends keyof T & string>(
    pathOrPreloaded: K, 
    options?: any
  ): Promise<ImagePrompt<T, A, K>> {
    let content: unknown;
    
    if (typeof pathOrPreloaded === 'string' && this.loader) {
      content = await this.loader.load(pathOrPreloaded, options);
    } else {
      content = pathOrPreloaded;
    }
    
    ImageConfigSchema.parse(await this.templateEngine.compile(content));
    return new ImagePrompt<T, A, K>(
      content, this.templateEngine, this.adapter, pathOrPreloaded,
    );
  }
}

export function createAgentMark<
  T extends PromptShape<T> = any,
  L extends Loader<T>  = Loader<T>,
  A extends Adapter<T> = Adapter<T>,
>(
  opts: { loader?: L; adapter: A; templateEngine?: TemplateEngine },
): AgentMark<T, A> {
  return new AgentMark<T, A>({
    loader: opts.loader,
    adapter: opts.adapter,
    templateEngine: opts.templateEngine,
  });
}