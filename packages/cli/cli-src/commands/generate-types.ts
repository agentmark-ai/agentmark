import { generateTypeDefinitions, fetchPromptsFrontmatter } from "@agentmark-ai/shared-utils";
import generateSchema from "./generate-schema";

type Options = {
  language: "typescript";
  local?: number;
  rootDir?: string;
};

const generateTypes = async ({ language, local, rootDir }: Options) => {
  if (language !== "typescript") {
    console.error(
      `Unsupported language: ${language}. Only TypeScript is supported.`
    );
    return;
  }

  try {
    console.error("Generating type definitions...");
    const prompts = await fetchPromptsFrontmatter({ local, rootDir });

    const typeDefinitions = await generateTypeDefinitions(prompts);

    process.stdout.write(typeDefinitions);

    // Also regenerate the prompt JSON Schema so model_name enum stays in sync
    try {
      await generateSchema({});
    } catch {
      // Schema generation is best-effort — skip if agentmark.json is absent (e.g. remote mode)
    }

    console.error("Done");
  } catch (error) {
    console.error("Error generating types:", error);
    process.exit(1);
  }
};

export default generateTypes;
