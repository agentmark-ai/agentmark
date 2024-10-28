import { ModelPluginRegistry } from "./model-plugin-registry";
import { OpenAIChatPlugin } from "./plugins/openai";


ModelPluginRegistry.register(new OpenAIChatPlugin(), [
  "gpt-4",
  "gpt-4-turbo",
  "gpt-4-1106-preview",
  "gpt-4-1106-vision-preview",
  "gpt-4-0314",
  "gpt-4-0613",
  "gpt-4-32k",
  "gpt-4-32k-0314",
  "gpt-4-32k-0613",
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-instruct",
  "gpt-3.5-turbo-16k",
  "gpt-3.5-turbo-0301",
  "gpt-3.5-turbo-0613",
  "gpt-3.5-turbo-16k-0613",
  "gpt-3.5-turbo-1106",
  "gpt-4o",
  "gpt-4o-mini",
]);
