import { ModelPluginRegistry } from "./model-plugin-registry";
import { AnthropicChatPlugin } from "./plugins/anthropic";
import { OpenAIChatPlugin } from "./plugins/openai";

ModelPluginRegistry.register(new OpenAIChatPlugin(), [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo",
]);

ModelPluginRegistry.register(new AnthropicChatPlugin(), [
  "claude-3-5-sonnet-latest",
  "claude-3-sonnet-latest"
])