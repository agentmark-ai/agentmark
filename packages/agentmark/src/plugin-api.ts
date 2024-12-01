import { toFrontMatter, runInference, getEnv } from "./utils"

const PluginAPI = {
  toFrontMatter,
  runInference,
  getEnv,
  fetch,
};

export { PluginAPI };

type IPluginAPI = typeof PluginAPI;

export { IPluginAPI };