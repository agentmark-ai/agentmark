import {
  ImageConfigSchema,
  ObjectConfigSchema,
  TextConfigSchema,
  SpeechConfigSchema,
} from "./schemas";
import { TemplateDXTemplateEngine } from "./template_engines/templatedx";
import { ObjectPrompt, ImagePrompt, TextPrompt, SpeechPrompt } from "./prompts";
import type {
  Loader,
  TemplateEngine,
  Adapter,
  PromptShape,
  KeysWithKind,
} from "./types";
import type { Root } from "mdast";

export interface AgentMarkOptions<
  T extends PromptShape<T>,
  A extends Adapter<T>
> {
  loader?: Loader<T>;
  adapter: A;
  templateEngine?: TemplateEngine;
}

export class AgentMark<T extends PromptShape<T>, A extends Adapter<T>> {
  protected loader?: Loader<T>;
  protected adapter: A;
  protected templateEngine: TemplateEngine;

  constructor({ loader, adapter, templateEngine }: AgentMarkOptions<T, A>) {
    this.loader = loader;
    this.adapter = adapter;
    this.templateEngine = templateEngine ?? new TemplateDXTemplateEngine();
  }

  async loadTextPrompt<K extends KeysWithKind<T, "text"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ) {
    let content: unknown;
    const pathProvided = typeof pathOrPreloaded === "string";

    if (pathProvided && this.loader) {
      content = await this.loader.load(pathOrPreloaded, options);
    } else {
      content = pathOrPreloaded;
    }

    TextConfigSchema.parse(
      await this.templateEngine.compile({
        template: content,
      })
    );
    return new TextPrompt<T, A, K>(
      content,
      this.templateEngine,
      this.adapter,
      pathProvided ? pathOrPreloaded : undefined
    );
  }

  async loadObjectPrompt<K extends KeysWithKind<T, "object"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ) {
    let content: unknown;
    const pathProvided = typeof pathOrPreloaded === "string";

    if (pathProvided && this.loader) {
      content = await this.loader.load(pathOrPreloaded, options);
    } else {
      content = pathOrPreloaded;
    }

    ObjectConfigSchema.parse(
      await this.templateEngine.compile({
        template: content,
      })
    );
    return new ObjectPrompt<T, A, K>(
      content,
      this.templateEngine,
      this.adapter,
      pathProvided ? pathOrPreloaded : undefined
    );
  }

  async loadImagePrompt<K extends KeysWithKind<T, "image"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ) {
    let content: unknown;
    const pathProvided = typeof pathOrPreloaded === "string";

    if (pathProvided && this.loader) {
      content = await this.loader.load(pathOrPreloaded, options);
    } else {
      content = pathOrPreloaded;
    }

    ImageConfigSchema.parse(
      await this.templateEngine.compile({
        template: content,
      })
    );
    return new ImagePrompt<T, A, K>(
      content,
      this.templateEngine,
      this.adapter,
      pathProvided ? pathOrPreloaded : undefined
    );
  }

  async loadSpeechPrompt<K extends KeysWithKind<T, "speech"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ) {
    let content: unknown;
    const pathProvided = typeof pathOrPreloaded === "string";

    if (pathProvided && this.loader) {
      content = await this.loader.load(pathOrPreloaded, options);
    } else {
      content = pathOrPreloaded;
    }

    SpeechConfigSchema.parse(
      await this.templateEngine.compile({
        template: content,
      })
    );
    return new SpeechPrompt<T, A, K>(
      content,
      this.templateEngine,
      this.adapter,
      pathProvided ? pathOrPreloaded : undefined
    );
  }
}

type DictOf<A extends Adapter<any>> = A["__dict"];

export function createAgentMark<A extends Adapter<any>>(opts: {
  adapter: A;
  loader?: Loader<DictOf<A>>;
  templateEngine?: TemplateEngine;
}): AgentMark<DictOf<A>, A> {
  return new AgentMark(opts);
}
