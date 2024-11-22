export const openaiCompletionParamsWithTools = (stream: boolean) => {
  const result: any = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant capable of solving basic math problems and using tools as needed.",
      },
      {
        role: "user",
        content: "What is 7 + 5?",
      },
    ],
    temperature: 0.7,
    top_p: 1,
    tool_choice: "auto",
    tools: [
      {
        function: {
          name: "weather",
          description: "Fetches the current weather for a specified location.",
          parameters: {
            type: "string"
          },
        },
        type: "function",
      },
    ],
  }
  if (stream) {
    result.stream = true;
    result.stream_options = {
      include_usage: true,
    }
  }
  return result;
};

export const openaiCompletionParamsWithSchema = (stream: boolean) => {
  const result: any = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant capable of solving basic math problems and using tools as needed.",
      },
      {
        role: "user",
        content: "What is 7 + 5?",
      },
    ],
    temperature: 0.7,
    top_p: 1,
    tool_choice: {
      type: "function",
      function: {
        name: "json"
      }
    },
    tools: [
      {
        type: "function",
        function: {
          name: "json",
          description: "Respond with a JSON object.",
          parameters: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "name of person"
              }
            },
            required: ["name"]
          }
        }
      }
    ]
  }
  if (stream) {
    result.stream = true;
    result.stream_options = {
      include_usage: true,
    }
  }
  return result;
};

export const promptWithHistory = {
  model: "gpt-4o-mini",
  top_p: 1,
  temperature: 0.7,
  messages: [
    {
      content: "What's 2 + 2?",
      role: "user",
    },
    {
      content: "5",
      role: "assistant",
    },
    {
      content: "What's 10 + 2?",
      role: "user",
    },
    {
      content: "5",
      role: "assistant",
    },
    {
      content: "Why are you bad at math?",
      role: "user",
    },
  ],
};