import { runInference, ModelPluginRegistry, load } from "@puzzlet/agentmark";
import AllModelPlugins from "@puzzlet/all-models";
import "dotenv/config";

ModelPluginRegistry.registerAll(AllModelPlugins);

const run = async () => {
  const props = { name: "Emily" };
  const Prompt = await load("./prompts/4.prompt.mdx");
  const result = await runInference(Prompt, props);
  console.log(result);
};

run();
