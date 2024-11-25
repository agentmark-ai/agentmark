import AnthropicChatPlugin from "./anthropic-chat";
import OpenAIChatPlugin from "./openai-chat";

const plugins = [
  {
    provider: new OpenAIChatPlugin(),
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
    provider: new AnthropicChatPlugin(),
    models: [
      "claude-3-5-haiku-latest",
      "claude-3-5-sonnet-latest",
      "claude-3-opus-latest"
    ]
  }
];

export default plugins;