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
import { EvalRegistry } from "./eval-registery";
import type { ScoreRegistry } from "./scores";

export interface AgentMarkOptions<
  T extends PromptShape<T>,
  A extends Adapter<T>
> {
  loader?: Loader<T>;
  adapter: A;
  templateEngine?: TemplateEngine;
  /** @deprecated Use `scores` instead. Will be removed in a future major version. */
  evalRegistry?: EvalRegistry;
  /** Score definitions with schemas and optional eval functions. */
  scores?: ScoreRegistry;
  /** List of allowed model names (e.g. from agentmark.json's builtInModels). When provided,
   *  model_name fields in prompt frontmatter must be one of these values. */
  builtInModels?: string[];
}

/** Validate that a model_name value is in the allowed list, throwing an actionable error if not. */
function assertModelNameAllowed(modelName: string, builtInModels: string[]): void {
  if (!builtInModels.includes(modelName)) {
    throw new Error(
      `model_name "${modelName}" is not in builtInModels. Run agentmark pull-models to add it.`
    );
  }
}

export class AgentMark<T extends PromptShape<T>, A extends Adapter<T>> {
  protected loader?: Loader<T>;
  protected adapter: A;
  protected templateEngine: TemplateEngine;
  protected scoreRegistry: ScoreRegistry;
  protected builtInModels?: string[];

  constructor({ loader, adapter, templateEngine, evalRegistry, scores, builtInModels }: AgentMarkOptions<T, A>) {
    this.loader = loader;
    this.adapter = adapter;
    this.templateEngine = templateEngine ?? new TemplateDXTemplateEngine();
    this.builtInModels = builtInModels;

    if (scores) {
      this.scoreRegistry = scores;
    } else if (evalRegistry) {
      this.scoreRegistry = Object.fromEntries(
        Object.entries(evalRegistry).map(([name, fn]) => [
          name,
          { eval: fn } as ScoreRegistry[string],
        ])
      );
    } else {
      this.scoreRegistry = {};
    }
  }

  getLoader() {
    return this.loader;
  }

  getAdapter() {
    return this.adapter;
  }

  /** @deprecated Use `getScoreRegistry()` instead. */
  getEvalRegistry(): EvalRegistry | undefined {
    const entries = Object.entries(this.scoreRegistry)
      .filter(([_, def]) => typeof def.eval === "function")
      .map(([name, def]) => [name, def.eval!] as const);
    return Object.fromEntries(entries);
  }

  getScoreRegistry(): ScoreRegistry {
    return this.scoreRegistry;
  }

  async loadTextPrompt<K extends KeysWithKind<T, "text"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ) {
    let content: unknown;
    const pathProvided = typeof pathOrPreloaded === "string";

    if (pathProvided && this.loader) {
      content = await this.loader.load(pathOrPreloaded, "text", options);
    } else {
      content = pathOrPreloaded;
    }

    const textConfig: TextConfig = await this.templateEngine.compile({
      template: content,
    });
    TextConfigSchema.parse(textConfig);
    if (this.builtInModels && this.builtInModels.length > 0) {
      assertModelNameAllowed(textConfig.text_config.model_name, this.builtInModels);
    }
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
      content = await this.loader.load(pathOrPreloaded, "object", options);
    } else {
      content = pathOrPreloaded;
    }

    const objectConfig: ObjectConfig = await this.templateEngine.compile({
      template: content,
    });
    ObjectConfigSchema.parse(objectConfig);
    if (this.builtInModels && this.builtInModels.length > 0) {
      assertModelNameAllowed(objectConfig.object_config.model_name, this.builtInModels);
    }
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
      content = await this.loader.load(pathOrPreloaded, "image", options);
    } else {
      content = pathOrPreloaded;
    }

    const imageConfig: ImageConfig = await this.templateEngine.compile({
      template: content,
    });
    ImageConfigSchema.parse(imageConfig);
    if (this.builtInModels && this.builtInModels.length > 0) {
      assertModelNameAllowed(imageConfig.image_config.model_name, this.builtInModels);
    }
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
      content = await this.loader.load(pathOrPreloaded, "speech", options);
    } else {
      content = pathOrPreloaded;
    }

    const speechConfig: SpeechConfig = await this.templateEngine.compile({
      template: content,
    });
    SpeechConfigSchema.parse(speechConfig);
    if (this.builtInModels && this.builtInModels.length > 0) {
      assertModelNameAllowed(speechConfig.speech_config.model_name, this.builtInModels);
    }
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
  /** @deprecated Use `scores` instead. */
  evalRegistry?: EvalRegistry;
  scores?: ScoreRegistry;
  builtInModels?: string[];
}): AgentMark<DictOf<A>, A> {
  return new AgentMark(opts);
}
