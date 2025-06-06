import * as fs from "fs-extra";
import path from "path";
import fm from "front-matter";
import { compile } from "json-schema-to-typescript";

type Options = {
  language: "typescript";
  local?: number;
  rootDir?: string;
};

type TextPromptFrontmatterV1_0 = {
  path: string;
  version: "1.0";
  text_config: {
    model_name: string;
    tools?: string[];
  };
  input_schema?: any;
};

type ObjectPromptFrontmatterV1_0 = {
  path: string;
  version: "1.0";
  object_config: {
    model_name: string;
    schema: any;
    tools?: Record<string, any>;
  };
  input_schema?: any;
};

type ImagePromptFrontmatterV1_0 = {
  path: string;
  version: "1.0";
  image_config: {
    model_name: string;
    tools?: Record<string, any>;
  };
  input_schema?: any;
};

type PromptFrontmatterV0 = {
  path: string;
  metadata: {
    model?: {
      settings?: {
        schema?: any;
        tools?: Record<string, any>;
      };
    };
  };
  input_schema?: any;
  version?: "0.0";
};

type PromptFrontmatter =
  | PromptFrontmatterV0
  | TextPromptFrontmatterV1_0
  | ObjectPromptFrontmatterV1_0
  | ImagePromptFrontmatterV1_0;

function getInterfaceName(filePath: string): string {
  return filePath
    .replace(/\.prompt\.mdx$/, "")
    .split("/")
    .map((part) => {
      // Handle snake_case, camelCase, and kebab-case
      return part
        .split(/[-_]|(?=[A-Z])/)
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join("")
        .replace(/[^a-zA-Z0-9]/g, "");
    })
    .join("$");
}

function getToolInterfaceName(toolName: string): string {
  return toolName
    .split(/[-_]|(?=[A-Z])/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

export async function findPromptFiles(dir: string): Promise<string[]> {
  const files = await fs.readdir(dir, { withFileTypes: true });
  let promptFiles: string[] = [];

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      promptFiles = promptFiles.concat(await findPromptFiles(fullPath));
    } else if (file.name.endsWith(".prompt.mdx")) {
      promptFiles.push(fullPath);
    }
  }

  return promptFiles;
}

async function generateTypeDefinitionsV1_0(
  prompts:
    | TextPromptFrontmatterV1_0[]
    | ObjectPromptFrontmatterV1_0[]
    | ImagePromptFrontmatterV1_0[]
): Promise<string> {
  let interfaces: string[] = [];
  const headerComment = `// Auto-generated types from AgentMark
// Do not edit this file directly

`;
  let output = "";
  let typeMapping: string[] = [];

  for (const prompt of prompts) {
    const { path: promptPath, input_schema } = prompt;
    const name = getInterfaceName(promptPath);
    let tools: any = {};
    try {
      let config = {};
      let kind = "text";
      let output_schema = null;

      if ("text_config" in prompt) {
        config = prompt.text_config;
        kind = "text";
        tools = prompt.text_config.tools || {};
      } else if ("object_config" in prompt) {
        config = prompt.object_config;
        kind = "object";
        tools = prompt.object_config.tools || {};
        output_schema = prompt.object_config.schema;
      } else if ("image_config" in prompt) {
        config = prompt.image_config;
        kind = "image";
        tools = prompt.image_config.tools || {};
      }

      const inputInterface = input_schema
        ? await compile(input_schema, `${name}In`, {
            bannerComment: "",
            additionalProperties: false,
          })
        : `interface ${name}In { [key: string]: any }`;
      const toolTypes = await generateToolTypes(tools);
      const outputInterface = output_schema
        ? await compile(output_schema, `${name}Out`, {
            bannerComment: "",
            additionalProperties: false,
          })
        : `type ${name}Out = string`;

      interfaces.push(
        inputInterface.replace("export interface", "interface"),
        outputInterface
          .replace("export type", "type")
          .replace("export interface", "interface")
      );

      output += toolTypes || "";

      output += `type ${name} = {
  kind: '${kind}';
  input:  ${name}In;
  output: ${name}Out;${
        toolTypes
          ? `
  tools?: Array<keyof Tools>;`
          : ""
      }
};\n\n`;

      typeMapping.push(`  "${promptPath}": ${name}`);
    } catch (error) {
      console.error(`Error processing ${promptPath}:`, error);
      interfaces.push(
        `interface ${name}In { [key: string]: any }
type ${name}Out = string`
      );
    }
  }

  output += `export default interface AgentmarkTypes {
${typeMapping.join(",\n")}
}\n`;

  return headerComment + interfaces.join("\n\n") + "\n\n" + output;
}

async function generateTypeDefinitionsV0(
  prompts: PromptFrontmatterV0[]
): Promise<string> {
  let interfaces: string[] = [];
  const headerComment = `// Auto-generated types from AgentMark
// Do not edit this file directly

`;
  let output = "";
  let typeMapping: string[] = [];

  for (const prompt of prompts) {
    const { path: promptPath, metadata, input_schema } = prompt;
    const name = getInterfaceName(promptPath);

    try {
      const inputInterface = input_schema
        ? await compile(input_schema, `${name}In`, {
            bannerComment: "",
            additionalProperties: false,
          })
        : `interface ${name}In { [key: string]: any }`;

      const outputSchema = metadata?.model?.settings?.schema;

      const outputInterface = outputSchema
        ? await compile(outputSchema, `${name}Out`, {
            bannerComment: "",
            additionalProperties: false,
          })
        : `type ${name}Out = string`;

      interfaces.push(
        inputInterface.replace("export interface", "interface"),
        outputInterface
          .replace("export type", "type")
          .replace("export interface", "interface")
      );

      output += `interface ${name} {
  input: ${name}In;
  output: ${name}Out;
}\n\n`;

      typeMapping.push(`  "${promptPath}": ${name}`);
    } catch (error: any) {
      console.error(`Error processing ${promptPath}:`, error);
      interfaces.push(
        `interface ${name}In { [key: string]: any }
type ${name}Out = string`
      );

      output += `interface ${name} {
  input: ${name}In;
  output: ${name}Out;
}\n\n`;

      typeMapping.push(`  "${promptPath}": ${name}`);
    }
  }

  output += `export default interface AgentmarkTypes {
${typeMapping.join(",\n")}
}\n`;

  return headerComment + interfaces.join("\n\n") + "\n\n" + output;
}

const isNewFormat = (frontmatter: any) => {
  return (
    frontmatter["text_config"] ||
    frontmatter["object_config"] ||
    frontmatter["image_config"]
  );
};

const generateTypeDefinitions = async (prompts: PromptFrontmatter[]) => {
  if (prompts[0].version === "1.0") {
    return generateTypeDefinitionsV1_0(prompts as any);
  }
  return generateTypeDefinitionsV0(prompts as any);
};

async function fetchPromptsFrontmatter(options: {
  local?: number;
  rootDir?: string;
}): Promise<PromptFrontmatter[]> {
  if (options.local) {
    const baseUrl = `http://localhost:${options.local}`;
    try {
      const pathsResponse = await fetch(`${baseUrl}/v1/prompts`);
      if (!pathsResponse.ok) {
        throw new Error(
          `Failed to fetch prompt paths: ${pathsResponse.statusText}`
        );
      }

      const { paths } = await pathsResponse.json();

      return Promise.all(
        paths.map(async (promptPath: string) => {
          const templateResponse = await fetch(
            `${baseUrl}/v1/templates?path=${promptPath}`
          );
          if (!templateResponse.ok) {
            throw new Error(
              `Failed to fetch template ${promptPath}: ${templateResponse.statusText}`
            );
          }

          const { data: ast } = await templateResponse.json();
          const yamlNode = ast.children.find(
            (node: any) => node.type === "yaml"
          );
          if (!yamlNode) {
            throw new Error(`No YAML frontmatter found in ${promptPath}`);
          }

          const { parse: parseYaml } = await import("yaml");
          const frontmatter = parseYaml(yamlNode.value);

          if (isNewFormat(frontmatter)) {
            return {
              path: promptPath,
              ...frontmatter,
              version: "1.0",
            };
          }

          return {
            path: promptPath,
            ...frontmatter,
          };
        })
      );
    } catch (error) {
      if (
        error instanceof TypeError &&
        error.message.includes("fetch failed")
      ) {
        console.error(`Connection failed to ${baseUrl}.`);
      }
      console.error("\nError details:", error);
      process.exit(1);
    }
  }

  if (options.rootDir) {
    if (!fs.existsSync(options.rootDir)) {
      throw new Error(`Directory not found at: ${options.rootDir}`);
    }

    const promptFiles = await findPromptFiles(options.rootDir);

    return Promise.all(
      promptFiles.map(async (file) => {
        const content = await fs.readFile(file, "utf-8");
        const { attributes } = fm<any>(content);

        if (isNewFormat(attributes)) {
          return {
            path: path.relative(options.rootDir!, file),
            ...attributes,
            version: "1.0",
          };
        }
        return {
          path: path.relative(options.rootDir!, file),
          ...attributes,
        };
      })
    );
  }

  throw new Error("Either --local or --root-dir must be specified");
}

async function generateToolTypes(tools: Record<string, any>) {
  let toolArgTypes: string[] = [];

  for (const [toolName, schema] of Object.entries(tools)) {
    const typeName = `${getToolInterfaceName(toolName)}Args`;

    try {
      const argInterface = schema.parameters
        ? await compile(schema.parameters, typeName, {
            bannerComment: "",
            additionalProperties: false,
          })
        : `type ${typeName} = { ${Object.entries(schema.parameters || {})
            .map(([key, value]) => `${key}: any`)
            .join("; ")} };`;

      toolArgTypes.push(
        argInterface
          .replace("export type", "type")
          .replace("export interface", "interface")
      );
    } catch (error) {
      console.error(`Error processing tool ${toolName}:`, error);
      toolArgTypes.push(`type ${typeName} = { [key: string]: any };`);
    }
  }

  if (Object.keys(tools).length > 0) {
    // Generate the Tools interface that combines all tool types
    const toolsInterface = `export interface Tools {
${Object.keys(tools)
  .map(
    (toolName) =>
      `  ${toolName}: { args: ${getToolInterfaceName(toolName)}Args };`
  )
  .join("\n")}
}`;

    return toolArgTypes.join("\n\n") + "\n\n" + toolsInterface + "\n\n";
  }

  return null;
}

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
