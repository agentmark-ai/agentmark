import {
  ObjectPrompt,
  PromptShape,
  KeysWithKind,
  TemplateEngine,
  PromptFormatParams,
} from "@agentmark/agentmark-core";
import { DefaultAdapter } from "./adapter";

export class DefaultObjectPrompt<
  T extends PromptShape<T>,
  A extends DefaultAdapter<T>,
  K extends KeysWithKind<T, "object"> & string
> extends ObjectPrompt<T, A, K> {
  constructor(tpl: unknown, eng: TemplateEngine, ad: A, path: K) {
    super(tpl, eng, ad, path);
  }

  async format({ props }: PromptFormatParams<T[K]["input"]>) {
    const compiled = await this.compile(props);
    return this.adapter.adaptObject<K>(compiled);
  }
}
