export const anthropicCompletionParamsWithTools = (stream: boolean) => {
  const result: any = {
    max_tokens: 4096,
    messages: [
      {
        content: [
          {
            text: "What is the current weather in Cleveland?",
            type: "text"
          }
        ],
        role: "user"
      }
    ],
    model: "claude-3-haiku-latest",
    system: [
      {
        text: "You are a helpful assistant able to access the weather.",
        type: "text"
      }
    ],
    temperature: 0.7,
    tool_choice: {
      type: "auto"
    },
    tools: [
      {
        description: "Fetches the current weather for a specified location.",
        input_schema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "location"
            }
          }
        },
        name: "weather"
      }
    ],
    top_p: 1
  }
  
  if (stream) {
    result.stream = true;
  }
  return result;
};

export const anthropicCompletionParamsWithSchema = (stream: boolean) => {
  const result: any = {
    max_tokens: 4096,
    messages: [
      {
        content: [
          {
            text: "Jessica and Michael decided to host a barbecue at their house, inviting their closest friends, Emily, David, and Sarah. As the evening went on, Jessica shared stories from her recent trip, while Michael grilled burgers, and Emily entertained everyone with her hilarious anecdotes.",
            type: "text"
          }
        ],
        role: "user"
      }
    ],
    model: "claude-3-haiku-latest",
    system: [
      {
        text: "You are a helpful assistant capable of finding all the names of the people in a given body of text.",
        type: "text"
      }
    ],
    temperature: 0.7,
    tool_choice: {
      name: "json",
      type: "tool"
    },
    tools: [
      {
        description: "Respond with a JSON object.",
        input_schema: {
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
        },
        name: "json"
      }
    ],
    top_p: 1
  };  
  if (stream) {
    result.stream = true;
  }
  return result;
};

export const promptWithHistory = {
  max_tokens: 4096,
  messages: [
    {
      content: [
        {
          text: "What's 2 + 2?",
          type: "text"
        }
      ],
      role: "user"
    },
    {
      content: [
        {
          text: "5",
          type: "text"
        }
      ],
      role: "assistant"
    },
    {
      content: [
        {
          text: "What's 10 + 2?",
          type: "text"
        }
      ],
      role: "user"
    },
    {
      content: [
        {
          text: "5",
          type: "text"
        }
      ],
      role: "assistant"
    },
    {
      content: [
        {
          text: "Why are you bad at math?",
          type: "text"
        }
      ],
      role: "user"
    }
  ],
  model: "claude-3-haiku-latest",
  temperature: 0.7,
  top_p: 1
};