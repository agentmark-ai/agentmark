import { generateTypeDefinitions, fetchPromptsFrontmatter } from "@agentmark/shared-utils";

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
    console.error("Done");
  } catch (error) {
    console.error("Error generating types:", error);
    process.exit(1);
  }
};

export default generateTypes;
