import path from "path";
import { generateTypeDefinitions, fetchPromptsFrontmatter, type GenerateTypesLanguage } from "@agentmark-ai/shared-utils";
import generateSchema from "./generate-schema";
import { readAgentmarkConfig } from "../utils/project";

type Options = {
  language: GenerateTypesLanguage;
  local?: number;
  rootDir?: string;
};

const generateTypes = async ({ language, local, rootDir }: Options) => {
  if (language !== "typescript" && language !== "python") {
    console.error(
      `Unsupported language: ${language}. Supported: typescript, python.`
    );
    return;
  }

  // When neither --local nor --root-dir is given, default the prompts root from
  // agentmark.json (<agentmarkPath>/agentmark). Without this the command throws
  // "Either --local or --root-dir must be specified". The docs run it as
  // `agentmark generate-types > agentmark.types.ts`, where the shell has ALREADY
  // truncated the output file by the time we throw, silently destroying an
  // existing agentmark.types.ts. Defaulting makes the documented happy path
  // work; an explicit --root-dir / --local still wins.
  let resolvedRootDir = rootDir;
  if (!local && !rootDir) {
    const { config } = readAgentmarkConfig(process.cwd());
    if (config) {
      resolvedRootDir = path.join(config.agentmarkPath || ".", "agentmark");
      console.error(
        `No --root-dir given; using '${resolvedRootDir}' from agentmark.json (pass --root-dir to override).`
      );
    }
  }

  try {
    console.error("Generating type definitions...");
    const prompts = await fetchPromptsFrontmatter({ local, rootDir: resolvedRootDir });

    const typeDefinitions = await generateTypeDefinitions(prompts, language);

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
