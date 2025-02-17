import { ModelPluginRegistry, ToolPluginRegistry, load, generateText} from "@puzzlet/agentmark";
import tools from "./tools";
import OpenAIChatPlugin from "@puzzlet/openai";
import AnthropicChatPlugin from "@puzzlet/anthropic";
import * as dotenv from 'dotenv';

dotenv.config();

ModelPluginRegistry.register(new OpenAIChatPlugin(), ["gpt4o"]);
ModelPluginRegistry.register(new AnthropicChatPlugin(), ["claude-3-5-haiku-latest"])

tools.map(({ tool, name }) => ToolPluginRegistry.register(tool, name))

const run = async () => {
  const Prompt = await load("./prompts/2.prompt.mdx");
  const result = await generateText(Prompt, {});
  console.log(result);
};

run();
