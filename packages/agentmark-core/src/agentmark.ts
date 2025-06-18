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
  SpeechConfig,
  ImageConfig,
  ObjectConfig,
  TextConfig,
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

  setLoader(loader: Loader<T>) {
    this.loader = loader;
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
  ) {
    let content: unknown;
    const pathProvided = typeof pathOrPreloaded === "string";

    if (pathProvided && this.loader) {
      content = await this.loader.load(pathOrPreloaded, options);
    } else {
      content = pathOrPreloaded;
    }

    const textConfig: TextConfig = await this.templateEngine.compile({
      template: content,
    });
    TextConfigSchema.parse(textConfig);
    return new TextPrompt<T, A, K>(
      content,
      this.templateEngine,
      this.adapter,
      pathProvided ? pathOrPreloaded : undefined,
      textConfig.test_settings,
      this.loader
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

    const objectConfig: ObjectConfig = await this.templateEngine.compile({
      template: content,
    });
    ObjectConfigSchema.parse(objectConfig);
    return new ObjectPrompt<T, A, K>(
      content,
      this.templateEngine,
      this.adapter,
      pathProvided ? pathOrPreloaded : undefined,
      objectConfig.test_settings,
      this.loader
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

    const imageConfig: ImageConfig = await this.templateEngine.compile({
      template: content,
    });
    ImageConfigSchema.parse(imageConfig);
    return new ImagePrompt<T, A, K>(
      content,
      this.templateEngine,
      this.adapter,
      pathProvided ? pathOrPreloaded : undefined,
      imageConfig.test_settings,
      this.loader
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

    const speechConfig: SpeechConfig = await this.templateEngine.compile({
      template: content,
    });
    SpeechConfigSchema.parse(speechConfig);
    return new SpeechPrompt<T, A, K>(
      content,
      this.templateEngine,
      this.adapter,
      pathProvided ? pathOrPreloaded : undefined,
      speechConfig.test_settings,
      this.loader
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
