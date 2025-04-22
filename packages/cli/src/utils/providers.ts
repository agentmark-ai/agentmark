export const Providers = {
  openai: {
    label: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
  },
  anthropic: {
    label: "Anthropic",
    models: ["claude-3-haiku", "claude-3-sonnet", "claude-3-opus"],
  },
  ollama: {
    label: "Ollama",
    models: [
      "llama3.1",
      "llama3.2",
      "mistral",
      "mistral-small",
      "mistral-small3.1",
      "gemma",
      "gemma2",
      "llava",
      "codellama",
      "qwen",
      "qwen2.5",
      "deepseek-r1",
      "tinyllama",
    ],
  },
  grok: {
    label: "Grok",
    models: [
      "grok-3",
      "grok-3-mini",
      "grok-3-fast",
      "grok-3-mini-fast",
      "grok-2-vision",
    ],
  },
  gemini: {
    label: "Gemini",
    models: [
      "gemini-2.5-pro-preview-03-25",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
    ],
  },
  groq: {
    label: "Groq",
    models: [
      "gemma2-9b-it",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "llama-guard-3-8b",
      "llama3-70b-8192",
      "llama3-8b-8192",
    ],
  },
};
