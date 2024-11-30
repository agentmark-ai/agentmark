import { toFrontMatter, runInference, getEnv } from "./utils"

const PluginAPI = {
  toFrontMatter,
  runInference,
  getEnv,
  fetch,
};

export default PluginAPI;

export type PluginAPI = typeof PluginAPI;