import { Adapter } from "@agentmark/agentmark-core";
import { InferenceAdapter } from "./types";
import { VercelAdapter } from "./vercel-adapter";

export const getInferenceAdapter = (
  adapter: Adapter<any>
): InferenceAdapter => {
  if (adapter.__name === "vercel-ai-v4") {
    return VercelAdapter.create();
  }
  throw new Error(`Unsupported adapter: ${adapter.__name}`);
};
