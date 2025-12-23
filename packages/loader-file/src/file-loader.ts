import path from "path";
import fs from "fs";
import readline from "readline";

/**
 * Prompt kind types supported by the file loader.
 */
export type PromptKind = "object" | "text" | "image" | "speech";

/**
 * Pre-built prompt structure as output by `agentmark build`.
 */
export interface BuiltPrompt {
  ast: unknown;
  metadata: {
    path: string;
    kind: PromptKind;
    name: string;
    builtAt: string;
  };
}

/**
 * FileLoader loads pre-built prompts and datasets from JSON files.
 *
 * Use this loader for local/static mode where prompts are pre-compiled
 * using `agentmark build`. The loader reads the compiled JSON files
 * containing pre-parsed ASTs.
 *
 * @example
 * ```typescript
 * import { FileLoader } from '@agentmark-ai/loader-file';
 *
 * // Point to the build output directory
 * const loader = new FileLoader('./dist/agentmark');
 *
 * const client = createAgentMarkClient({ adapter, loader });
 *
 * // Load a pre-built prompt - extension is optional
 * const prompt = await client.loadTextPrompt('party-planner');
 * // Also works with full extension:
 * const prompt2 = await client.loadTextPrompt('party-planner.prompt.mdx');
 * ```
 */
export class FileLoader {
  private basePath: string;

  /**
   * Creates a new FileLoader.
   * @param builtDir - Path to the directory containing built prompt JSON files (output of `agentmark build`)
   */
  constructor(builtDir: string) {
    const cwd = (() => {
      try {
        return process.cwd();
      } catch {
        return process.env.PWD || process.env.INIT_CWD || ".";
      }
    })();
    this.basePath = path.resolve(cwd, builtDir);
  }

  /**
   * Validates a user-provided path and returns a safe absolute path within the base directory.
   * Throws an error if the path attempts to escape the base directory.
   */
  private validateAndResolvePath(userPath: string): string {
    // Reject absolute paths
    if (path.isAbsolute(userPath)) {
      throw new Error("Absolute paths are not allowed");
    }

    // Normalize the path to resolve . and .. sequences
    const normalizedPath = path.normalize(userPath);

    // Check if normalized path tries to escape by starting with /
    if (normalizedPath.startsWith("/")) {
      throw new Error("Invalid path: path traversal detected");
    }

    // Join with base path to create full path
    const fullPath = path.join(this.basePath, normalizedPath);

    // Verify the resolved path is still within the base directory
    const resolvedPath = path.resolve(fullPath);
    const resolvedBase = path.resolve(this.basePath);
    if (
      !resolvedPath.startsWith(resolvedBase + path.sep) &&
      resolvedPath !== resolvedBase
    ) {
      throw new Error("Access denied: path outside allowed directory");
    }

    return resolvedPath;
  }

  /**
   * Normalizes a template path to the JSON file path.
   * Accepts paths with or without the .prompt.mdx extension.
   *
   * @param templatePath - The prompt path (e.g., 'party-planner', 'party-planner.prompt.mdx', or 'party-planner.prompt')
   * @returns The normalized JSON file path
   */
  private normalizeTemplatePath(templatePath: string): string {
    // If it already ends with .json, use as-is
    if (templatePath.endsWith(".json")) {
      return templatePath;
    }

    // If it ends with .mdx, convert to .json
    if (templatePath.endsWith(".mdx")) {
      return templatePath.replace(/\.mdx$/, ".json");
    }

    // If it ends with .prompt (no .mdx), add .json
    if (templatePath.endsWith(".prompt")) {
      return templatePath + ".json";
    }

    // Otherwise, add .prompt.json
    return templatePath + ".prompt.json";
  }

  /**
   * Loads a pre-built prompt by its path.
   * The .prompt.mdx extension is optional.
   *
   * @param templatePath - The prompt path (e.g., 'party-planner' or 'party-planner.prompt.mdx')
   * @param _promptType - The prompt type (unused, determined from built metadata)
   * @param _options - Additional options (unused)
   * @returns The pre-parsed AST
   */
  async load(
    templatePath: string,
    _promptType: PromptKind,
    _options?: unknown
  ): Promise<unknown> {
    const jsonPath = this.normalizeTemplatePath(templatePath);
    const safePath = this.validateAndResolvePath(jsonPath);

    if (!fs.existsSync(safePath)) {
      throw new Error(
        `Pre-built prompt not found: ${jsonPath}. Run 'agentmark build' to compile your prompts.`
      );
    }

    const content = fs.readFileSync(safePath, "utf-8");
    const builtPrompt: BuiltPrompt = JSON.parse(content);

    return builtPrompt.ast;
  }

  /**
   * Loads a dataset file.
   *
   * @param datasetPath - Path to the dataset file (e.g., 'party.jsonl')
   * @returns A readable stream of dataset rows
   */
  async loadDataset(
    datasetPath: string
  ): Promise<
    ReadableStream<{
      input: Record<string, unknown>;
      expected_output?: string;
    }>
  > {
    if (!datasetPath.endsWith(".jsonl")) {
      throw new Error("Dataset must be a JSON Lines file (.jsonl)");
    }

    const safePath = this.validateAndResolvePath(datasetPath);

    if (!fs.existsSync(safePath)) {
      throw new Error(
        `Dataset not found: ${datasetPath}. Ensure it was included in 'agentmark build' output.`
      );
    }

    const fileStream = fs.createReadStream(safePath, { encoding: "utf8" });
    const lines = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let rowCount = 0;
    return new ReadableStream({
      async start(controller) {
        for await (const line of lines) {
          if (!line.trim()) continue; // Skip empty lines
          try {
            const jsonData = JSON.parse(line);
            // Validate that the row has an input field
            if (!jsonData.input || typeof jsonData.input !== "object") {
              throw new Error(
                `Invalid dataset row at line ${rowCount + 1}: missing or invalid 'input' field. Each row must have an 'input' object.`
              );
            }
            controller.enqueue(jsonData);
            rowCount++;
          } catch (error) {
            if (error instanceof SyntaxError) {
              throw new Error(
                `Failed to parse JSON at line ${rowCount + 1} in dataset ${datasetPath}: ${error.message}`
              );
            }
            throw error;
          }
        }
        if (rowCount === 0) {
          throw new Error(
            `Dataset ${datasetPath} is empty or contains no valid rows`
          );
        }
        controller.close();
      },
    });
  }
}
