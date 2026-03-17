import type { Root } from "mdast";
import {
  AgentMark,
  type PromptShape,
  type KeysWithKind,
  type AgentMarkOptions,
  type AdaptOptions,
  type TextConfig,
  type ObjectConfig,
} from "@agentmark-ai/prompt-core";
import { TextConfigSchema } from "@agentmark-ai/prompt-core";
import { MastraTextPrompt } from "./text-prompt";
import { MastraObjectPrompt } from "./object-prompt";
import { MastraAdapter } from "./adapter";
import { IfShapeIsUndefined } from "./types";
import type { ToolsInput } from "@mastra/core/agent";

export class MastraAgentMark<
  T extends PromptShape<T> | undefined,
  A extends MastraAdapter<T, ToolsInput>
> extends AgentMark<any, A> {
  constructor(opts: AgentMarkOptions<any, A>) {
    super(opts);
  }

  async loadTextPrompt<
    K extends IfShapeIsUndefined<T, any, KeysWithKind<T, "text"> & string>
  >(
    pathOrPreloaded: K | Root,
    options?: AdaptOptions
  ): Promise<MastraTextPrompt<T, A, K>> {
    let content: unknown;
    const pathProvided = typeof pathOrPreloaded === "string";

    if (pathProvided && this.getLoader()) {
      content = await this.getLoader()!.load(pathOrPreloaded, "text", options);
    } else {
      content = pathOrPreloaded;
    }

    const textConfig: TextConfig = await this.templateEngine.compile({
      template: content,
    });
    TextConfigSchema.parse(textConfig);
    return new MastraTextPrompt<T, A, K>(
      content,
      this.templateEngine,
      this.getAdapter(),
      pathProvided ? pathOrPreloaded : undefined,
      textConfig.test_settings,
      this.getLoader()
    );
  }

  async loadObjectPrompt<
    K extends IfShapeIsUndefined<T, any, KeysWithKind<T, "object"> & string>
  >(
    pathOrPreloaded: K | Root,
    options?: AdaptOptions
  ): Promise<MastraObjectPrompt<T, A, K>> {
    let content: unknown;
    const pathProvided = typeof pathOrPreloaded === "string";

    if (pathProvided && this.getLoader()) {
      content = await this.getLoader()!.load(
        pathOrPreloaded,
        "object",
        options
      );
    } else {
      content = pathOrPreloaded;
    }

    const objectConfig: ObjectConfig = await this.templateEngine.compile({
      template: content,
    });

    return new MastraObjectPrompt<T, A, K>(
      content,
      this.templateEngine,
      this.getAdapter(),
      pathProvided ? pathOrPreloaded : undefined,
      objectConfig.test_settings,
      this.getLoader()
    );
  }
}
