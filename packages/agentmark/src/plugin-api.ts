import { toFrontMatter, runInference, getEnv, streamInference } from "./utils"

const PluginAPI = {
  toFrontMatter,
  runInference,
  getEnv,
  fetch,
  streamInference
};

export { PluginAPI };

type IPluginAPI = typeof PluginAPI;

export { IPluginAPI };