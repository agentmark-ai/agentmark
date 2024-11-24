export const openaiCompletionParamsWithTools = (stream: boolean) => {
  const result: any = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant able to access the weather.",
      },
      {
        role: "user",
        content: "What is the current weather in Cleveland?",
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
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "location"
              }
            }
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
          "You are a helpful assistant capable of finding all the names of the people in a given body of text.",
      },
      {
        role: "user",
        content: `Jessica and Michael decided to host a barbecue at their house, inviting their closest friends, Emily, David, and Sarah. As the evening went on, Jessica shared stories from her recent trip, while Michael grilled burgers, and Emily entertained everyone with her hilarious anecdotes.`,
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
              names: {
                type: "array",
                items: {
                  type: "string"
                },
                description: "names of people",
              }
            },
            required: ["names"]
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