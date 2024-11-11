import { ModelPluginRegistry } from "./model-plugin-registry";
import { OpenAIChatPlugin } from "./plugins/openai";


ModelPluginRegistry.register(new OpenAIChatPlugin(), [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo",
]);
