"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const vercel_ai_v4_adapter_1 = require("@agentmark/vercel-ai-v4-adapter");
const openai_1 = require("@ai-sdk/openai");
const ai_1 = require("ai");
const agentmark_core_1 = require("@agentmark/agentmark-core");
const modelRegistry = new vercel_ai_v4_adapter_1.VercelAIModelRegistry();
const loader = new agentmark_core_1.FileLoader("./fixtures");
modelRegistry.registerModels(["gpt-4o", "gpt-4o-mini"], (name) => {
    return (0, openai_1.openai)(name);
});
const tools = new vercel_ai_v4_adapter_1.VercelAIToolRegistry().register("weather", ({ location }) => ({ tempC: 22 }));
const agentMark = (0, vercel_ai_v4_adapter_1.createAgentMarkClient)({
    loader,
    modelRegistry,
    toolRegistry: tools,
});
async function run() {
    const prompt = await agentMark.loadTextPrompt("customer-support.prompt.mdx");
    const props = {
        customer_question: "My package hasn't arrived yet. Can you help me track it?",
    };
    const vercelInput = await prompt.format({ props });
    const result = await (0, ai_1.generateText)(vercelInput);
    console.log(result.text);
}
run();
