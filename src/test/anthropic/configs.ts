export const anthropicCompletionParamsWithTools = (stream: boolean) => {
  const result: any = {
    max_tokens: 4096,
    messages: [
      {
        content: [
          {
            text: "What is 7 + 5?",
            type: "text"
          }
        ],
        role: "user"
      }
    ],
    model: "claude-3-haiku-latest",
    system: [
      {
        text: "You are a helpful assistant capable of solving basic math problems and using tools as needed.",
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
          type: "string"
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
            text: "What is 7 + 5?",
            type: "text"
          }
        ],
        role: "user"
      }
    ],
    model: "claude-3-haiku-latest",
    system: [
      {
        text: "You are a helpful assistant capable of solving basic math problems and using tools as needed.",
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
          properties: {
            name: {
              description: "name of person",
              type: "string"
            }
          },
          required: ["name"],
          type: "object"
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