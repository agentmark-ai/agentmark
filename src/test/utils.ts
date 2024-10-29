export const openAIResponseWithNoStream = {
  id: "123",
  object: "chat.completion",
  created: 1669999999,
  model: "gpt-4o-mini",
  choices: [
    {
      message: {
        content: "4",
        role: "assistant",
      },
      finish_reason: "stop",
      index: 0,
    },
  ],
  usage: {
    prompt_tokens: 5,
    completion_tokens: 5,
    total_tokens: 10,
  },
};

const mockSteamResponses = [
  {
    id: "123",
    object: "chat.completion.chunk",
    created: 1677652288,
    model: "gpt-4o-mini",
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          content: "4",
        },
        finish_reason: "stop",
      },
    ],
  },
];

export const openAIResponseWithStream = {
  [Symbol.asyncIterator]: async function* () {
    for (const response of mockSteamResponses) {
      yield response;
    }
  },
};
