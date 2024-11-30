import AnthropicChatPlugin from "./anthropic-chat";
import OpenAIChatPlugin from "./openai-chat";
import PluginAPI  from "../plugin-api";

const plugins = [
  {
    provider: new OpenAIChatPlugin(PluginAPI),
    models: [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-4",
      "o1-mini",
      "o1-preview",
      "gpt-3.5-turbo",
    ]
  }, {
    provider: new AnthropicChatPlugin(PluginAPI),
    models: [
      "claude-3-5-haiku-latest",
      "claude-3-5-sonnet-latest",
      "claude-3-opus-latest"
    ]
  }
];

export default plugins;