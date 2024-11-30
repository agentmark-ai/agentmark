import { expect, test } from "vitest";
import { getRawConfig } from "../../runtime";

test("Get raw config", async () => {
  const ast = {
    type: "root",
    children: [
      {
        type: "yaml",
        value:
          "name: grade\nmetadata:\n  model:\n    name: gpt-4\n    settings:\n      top_p: 1\n      max_tokens: 4096\n      temperature: 0.7\n      presence_penalty: 0\n      frequency_penalty: 0\ntest_settings:\n  props:",
      },
      {
        type: "mdxJsxFlowElement",
        name: "System",
        attributes: [],
        children: [
          {
            type: "heading",
            depth: 1,
            children: [{ type: "text", value: "Enhanced AI Prompt Generator" }],
          },
        ],
      },
      {
        type: "mdxJsxFlowElement",
        name: "User",
        attributes: [],
        children: [{ type: "mdxFlowExpression", value: "props.userInput" }],
      },
    ],
  };
  const agentMark = await getRawConfig(ast as any, { userInput: "test" });

  expect(agentMark).toEqual({
    name: "grade",
    messages: [
      {
        role: "system",
        content: "# Enhanced AI Prompt Generator",
      },
      {
        role: "user",
        content: "test",
      },
    ],
    metadata: {
      model: {
        name: "gpt-4",
        settings: {
          top_p: 1,
          max_tokens: 4096,
          temperature: 0.7,
          presence_penalty: 0,
          frequency_penalty: 0,
        },
      },
    },
  });
});
