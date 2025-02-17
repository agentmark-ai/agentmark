import { toFrontMatter,  getEnv, generateObject, generateText, streamObject, streamText,} from "./utils"

const PluginAPI = {
  toFrontMatter,
  getEnv,
  fetch,
  generateObject,
  generateText,
  streamObject,
  streamText,
};

export { PluginAPI };

type IPluginAPI = typeof PluginAPI;

export { IPluginAPI };