export const ollamaCompletionParamsWithTools = (stream: boolean) => {
  const result: any = {
    messages: [
      {
        content: "You are a helpful assistant able to access the weather.",
        role: "system"
      },
      {
        content: "What is the current weather in Cleveland?",
        role: "user"
      }
    ],
    model: "llama3.2",
    options: {
      temperature: 0.7,
      top_p: 1
    },
    stream: false,
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
          }
        },
        type: "function"
      }
    ]
  }  
  if (stream) {
    delete result.stream;
  }
  return result;
};

export const ollamaCompletionParamsWithSchema = (stream: boolean) => {
  const result: any = {
    format: "json",
    messages: [
      {
        content: `JSON schema:
{"type":"object","properties":{"names":{"type":"array","items":{"type":"string"},"description":"names of people"}},"required":["names"]}
You MUST answer with a JSON object that matches the JSON schema above.`,
        role: "system",
      },
      {
        content: "You are a helpful assistant capable of finding all the names of the people in a given body of text.",
        role: "system",
      },
      {
        content: "Jessica and Michael decided to host a barbecue at their house, inviting their closest friends, Emily, David, and Sarah. As the evening went on, Jessica shared stories from her recent trip, while Michael grilled burgers, and Emily entertained everyone with her hilarious anecdotes.",
        role: "user",
      },
    ],
    model: "llama3.2",
    options: {
      temperature: 0.7,
      top_p: 1,
    },
    stream: false,
  }  
  if (stream) {
    delete result.stream;
  }
  return result;
};

export const promptWithHistory = {
  model: "llama3.2",
  options: {
    top_p: 1,
    temperature: 0.7,
  },
  stream: false,
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