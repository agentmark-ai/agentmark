import {
  ImageConfigSchema,
  ObjectConfigSchema,
  TextConfigSchema,
  SpeechConfigSchema,
} from "./schemas";
import { TemplateDXTemplateEngine } from "./template_engines/templatedx";
import { 
  ObjectPrompt, 
  ImagePrompt, 
  TextPrompt, 
  SpeechPrompt
} from "./prompts";
import type {
  Loader,
  TemplateEngine,
  Adapter,
  PromptShape,
  KeysWithKind,
  SpeechConfig,
  ImageConfig,
  ObjectConfig,
  TextConfig,
} from "./types";
import type { Root } from "mdast";

export interface AgentMarkOptions<
  T extends PromptShape<T>,
  A extends Adapter<T>,
  Context = unknown
> {
  loader?: Loader<T, Context>;
  adapter: A;
  templateEngine?: TemplateEngine;
}

export class AgentMark<T extends PromptShape<T>, A extends Adapter<T>, Context = unknown> {
  protected loader?: Loader<T, Context>;
  protected adapter: A;
  protected templateEngine: TemplateEngine;

  constructor({ loader, adapter, templateEngine }: AgentMarkOptions<T, A, Context>) {
    this.loader = loader;
    this.adapter = adapter;
    this.templateEngine = templateEngine ?? new TemplateDXTemplateEngine();
  }

  getLoader() {
    return this.loader;
  }

  getAdapter() {
    return this.adapter;
  }

  async loadTextPrompt<K extends KeysWithKind<T, "text"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<TextPrompt<T, A, K, Context>> {
    let content: unknown;
    let context: Context | undefined;
    const pathProvided = typeof pathOrPreloaded === "string";

    if (pathProvided && this.loader) {
      const result = await this.loader.load(pathOrPreloaded, "text", options);
      content = result.prompt;
      context = result.context;
    } else {
      content = pathOrPreloaded;
    }

    const textConfig: TextConfig = await this.templateEngine.compile({
      template: content,
    });
    TextConfigSchema.parse(textConfig);
    return new TextPrompt<T, A, K, Context>(
      content,
      this.templateEngine,
      this.adapter,
      pathProvided ? pathOrPreloaded : undefined,
      textConfig.test_settings,
      this.loader,
      context
    );
  }

  async loadObjectPrompt<K extends KeysWithKind<T, "object"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<ObjectPrompt<T, A, K, Context>> {
    let content: unknown;
    let context: Context | undefined;
    const pathProvided = typeof pathOrPreloaded === "string";

    if (pathProvided && this.loader) {
      const result = await this.loader.load(pathOrPreloaded, "object", options);
      content = result.prompt;
      context = result.context;
    } else {
      content = pathOrPreloaded;
    }

    const objectConfig: ObjectConfig = await this.templateEngine.compile({
      template: content,
    });
    ObjectConfigSchema.parse(objectConfig);
    return new ObjectPrompt<T, A, K, Context>(
      content,
      this.templateEngine,
      this.adapter,
      pathProvided ? pathOrPreloaded : undefined,
      objectConfig.test_settings,
      this.loader,
      context
    );
  }

  async loadImagePrompt<K extends KeysWithKind<T, "image"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<ImagePrompt<T, A, K, Context>> {
    let content: unknown;
    let context: Context | undefined;
    const pathProvided = typeof pathOrPreloaded === "string";

    if (pathProvided && this.loader) {
      const result = await this.loader.load(pathOrPreloaded, "image", options);
      content = result.prompt;
      context = result.context;
    } else {
      content = pathOrPreloaded;
    }

    const imageConfig: ImageConfig = await this.templateEngine.compile({
      template: content,
    });
    ImageConfigSchema.parse(imageConfig);
    return new ImagePrompt<T, A, K, Context>(
      content,
      this.templateEngine,
      this.adapter,
      pathProvided ? pathOrPreloaded : undefined,
      imageConfig.test_settings,
      this.loader,
      context
    );
  }

  async loadSpeechPrompt<K extends KeysWithKind<T, "speech"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<SpeechPrompt<T, A, K, Context>> {
    let content: unknown;
    let context: Context | undefined;
    const pathProvided = typeof pathOrPreloaded === "string";

    if (pathProvided && this.loader) {
      const result = await this.loader.load(pathOrPreloaded, "speech", options);
      content = result.prompt;
      context = result.context;
    } else {
      content = pathOrPreloaded;
    }

    const speechConfig: SpeechConfig = await this.templateEngine.compile({
      template: content,
    });
    SpeechConfigSchema.parse(speechConfig);
    return new SpeechPrompt<T, A, K, Context>(
      content,
      this.templateEngine,
      this.adapter,
      pathProvided ? pathOrPreloaded : undefined,
      speechConfig.test_settings,
      this.loader,
      context
    );
  }
}

type DictOf<A extends Adapter<any>> = A["__dict"];



export function createAgentMark<A extends Adapter<any>, Context = unknown>(opts: {
  adapter: A;
  loader?: Loader<DictOf<A>, Context>;
  templateEngine?: TemplateEngine;
}): AgentMark<DictOf<A>, A, Context> {
  return new AgentMark(opts);
}
