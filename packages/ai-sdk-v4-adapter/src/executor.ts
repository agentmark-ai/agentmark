import * as ai from "ai";
import { createVercelExecutor, v4Chunks } from "@agentmark-ai/ai-sdk-shared";
import type { Executor } from "@agentmark-ai/prompt-core";

/**
 * VercelAIv4Executor — AI SDK v4 executor, built by the shared factory.
 * See the v5 adapter for the rationale on thunk-binding.
 */
export const VercelAIv4Executor: new () => Executor = class {
  private readonly delegate = createVercelExecutor({
    name: "vercel-ai-v4",
    chunks: v4Chunks,
    sdk: {
      generateText: (p: any) => ai.generateText(p),
      streamText: (p: any) => ai.streamText(p),
      generateObject: (p: any) => ai.generateObject(p),
      streamObject: (p: any) => ai.streamObject(p),
      Output: (ai as any).Output,
      generateImage: (p: any) => (ai as any).experimental_generateImage(p),
      generateSpeech: (p: any) => (ai as any).experimental_generateSpeech(p),
    },
  });
  readonly name = this.delegate.name;
  capabilities() {
    return this.delegate.capabilities();
  }
  executeText = this.delegate.executeText.bind(this.delegate);
  executeObject = this.delegate.executeObject.bind(this.delegate);
  executeImage = this.delegate.executeImage!.bind(this.delegate);
  executeSpeech = this.delegate.executeSpeech!.bind(this.delegate);
} as any;
