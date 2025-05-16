import {
  ObjectPrompt,
  PromptShape,
  TemplateEngine,
  KeysWithKind,
  PromptFormatParams,
} from "@agentmark/agentmark-core";
import { VercelAIAdapter } from "./adapter";

export class VercelAIObjectPrompt<
  T extends PromptShape<T>,
  K extends KeysWithKind<T, "object"> & string
> extends ObjectPrompt<T, VercelAIAdapter<T>, K> {
  constructor(
    tpl: unknown,
    eng: TemplateEngine,
    ad: VercelAIAdapter<T>,
    path: K
  ) {
    super(tpl, eng, ad, path);
  }

  async format({ props, ...options }: PromptFormatParams<T[K]["input"]>) {
    const compiled = await this.compile(props);
    return this.adapter.adaptObject<K>(compiled, options, this.metadata(props));
  }
}
