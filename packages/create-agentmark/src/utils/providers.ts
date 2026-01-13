export const Providers = {
  openai: {
    label: "OpenAI",
    languageModels: [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4",
      "gpt-5",
      "gpt-4-turbo",
      "gpt-3.5-turbo",
    ],
    imageModels: ["dall-e-3", "dall-e-2"],
    speechModels: ["tts-1", "tts-1-hd"],
  },
  anthropic: {
    label: "Anthropic",
    languageModels: [
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
    ],
    imageModels: [],
    speechModels: [],
  },
};
