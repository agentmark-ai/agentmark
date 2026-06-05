import * as ai from "ai";
import { createVercelExecutor, v5Chunks } from "@agentmark-ai/ai-sdk-shared";
import type { Executor } from "@agentmark-ai/prompt-core";

/**
 * VercelAIExecutor — AI SDK v5 executor, built by the shared factory.
 *
 * All translation logic lives in `@agentmark-ai/ai-sdk-shared`; this file
 * only binds the v5-pinned SDK functions and the v5 chunk adapter.
 *
 * Each SDK method is wrapped in a thunk rather than captured as a value
 * so that tests which reassign `ai.generateObject` mid-run still route
 * through the updated mock. This matches the live-binding behavior users
 * get with named imports in ESM.
 */
export const VercelAIExecutor: new () => Executor = class {
  private readonly delegate = createVercelExecutor({
    name: "vercel-ai-v5",
    chunks: v5Chunks,
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
